'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertTriangle,
  BadgeCheck,
  BriefcaseBusiness,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  ClipboardCheck,
  ClipboardList,
  Download,
  FileText,
  Fingerprint,
  HeartPulse,
  IdCard,
  Import,
  Lock,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Save,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  Users,
  X,
} from 'lucide-react';

type Role =
  | 'Super Admin'
  | 'HR Director'
  | 'HR Manager'
  | 'HR Officer'
  | 'Admin Officer'
  | 'Payroll Officer'
  | 'Department Head'
  | 'Line Manager'
  | 'IT Administrator'
  | 'HSE Officer'
  | 'Auditor';

type EmploymentType =
  | 'Permanent'
  | 'Contract'
  | 'Temporary'
  | 'Intern'
  | 'Consultant'
  | 'Expatriate'
  | 'Industrial Trainee'
  | 'NYSC'
  | 'Outsourced Staff';

type EmploymentStatus =
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
  | 'Field Assignment';

type Severity = 'high' | 'medium' | 'low';

type ApiState<T> = { status: 'idle' | 'loading' | 'ready' | 'error'; data?: T; error?: string };

type FormOptions = {
  departments: string[];
  divisions: string[];
  businessUnits: string[];
  locations: string[];
  jobTitles: string[];
  jobGrades: string[];
  costCenters: string[];
  projectSites: string[];
  payrollGroups: string[];
  salaryGrades: string[];
  banks: string[];
  pensionProviders: string[];
  benefitGroups: string[];
  workModes: string[];
  shiftPatterns: string[];
  staffCategories: string[];
  employeeCategories: string[];
  roleProfiles: string[];
};

type DraftPersonal = {
  title: string;
  firstName: string;
  middleName: string;
  lastName: string;
  preferredName: string;
  gender: string;
  dateOfBirth: string;
  maritalStatus: string;
  nationality: string;
  stateOfOrigin: string;
  localGovernmentArea: string;
  religion: string;
  languagesSpoken: string;
  photoFile?: { fileName: string; mimeType: string; sizeBytes: number } | null;
};

type DraftContact = {
  officialEmail: string;
  personalEmail: string;
  primaryPhone: string;
  alternatePhone: string;
  residentialAddress: string;
  permanentAddress: string;
  nearestBusStop: string;
  city: string;
  state: string;
  country: string;
  postalCode: string;
  officeExtension: string;
};

type DraftEmployment = {
  employeeId: string;
  employmentType: EmploymentType | '';
  employmentStatus: EmploymentStatus | '';
  staffCategory: string;
  employeeCategory: string;
  dateJoined: string;
  probationStartDate: string;
  probationEndDate: string;
  confirmationDueDate: string;
  contractStartDate: string;
  contractEndDate: string;
  workMode: string;
  workLocation: string;
  shiftPattern: string;
  unionStatus: string;
  expatriateStatus: string;
  onboardingScheduled: boolean;
};

type DraftJob = {
  jobTitle: string;
  designation: string;
  jobGrade: string;
  department: string;
  division: string;
  businessUnit: string;
  costCenter: string;
  projectSite: string;
  officeLocation: string;
  reportingManager: string;
  functionalManager: string;
  departmentHead: string;
  hrBusinessPartner: string;
  roleProfile: string;
  jobDescription: string;
  keyResponsibilities: string;
  matrixReporting: boolean;
  actingPosition: boolean;
  projectAssignment: boolean;
  secondment: boolean;
};

type EmergencyContact = {
  id: string;
  fullName: string;
  relationship: string;
  phoneNumber: string;
  alternatePhone: string;
  email: string;
  address: string;
  isPrimary: boolean;
  isNextOfKin: boolean;
  isBeneficiary: boolean;
};

type DocumentDraft = {
  id: string;
  category: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  expiresAt: string;
  status: 'Pending' | 'Uploaded' | 'Rejected';
};

type PayrollDraft = {
  payrollGroup: string;
  salaryGrade: string;
  basicSalary: string;
  allowancesTemplate: string;
  deductionTemplate: string;
  bankName: string;
  accountNumber: string;
  accountName: string;
  pensionProvider: string;
  pensionPin: string;
  taxId: string;
  nhfNumber: string;
  healthInsurancePlan: string;
  benefitGroup: string;
  setupAssignedToPayroll: boolean;
};

type ChecklistItem = {
  id: string;
  title: string;
  status: 'Pending' | 'In Progress' | 'Done' | 'Blocked';
  responsibleOfficer: string;
  dueDate: string;
  notes: string;
};

type EmployeeDraftPayload = {
  personal: DraftPersonal;
  contact: DraftContact;
  employment: DraftEmployment;
  job: DraftJob;
  emergencyContacts: EmergencyContact[];
  documents: DocumentDraft[];
  payroll: PayrollDraft;
  onboardingChecklist: ChecklistItem[];
};

type ValidationResult = {
  valid: boolean;
  completenessPct: number;
  errors: { path: string; message: string; severity: Severity }[];
  warnings: { path: string; message: string; severity: Severity }[];
  missingFields: string[];
};

type DuplicateResult = {
  status: 'ok' | 'potential-duplicate';
  matches: { employeeId?: string; draftId?: string; reason: string }[];
  confidence: number;
};

type DraftResponse = { draftId: string; status: 'draft' | 'submitted' | 'approved' | 'created'; updatedAt: string };

type CreateEmployeeResponse = { employeeId: string; startedOnboarding: boolean };

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

const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
const isPhone = (s: string) => /^[+]?[\d\s()-]{7,20}$/.test(s.trim());
const todayIso = (initialNow: string) => initialNow.slice(0, 10);

const parseDate = (yyyyMmDd: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(yyyyMmDd)) return null;
  const ms = new Date(`${yyyyMmDd}T00:00:00.000Z`).getTime();
  return Number.isFinite(ms) ? ms : null;
};

const addMonths = (yyyyMmDd: string, months: number) => {
  const ms = parseDate(yyyyMmDd);
  if (!ms) return null;
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const day = d.getUTCDate();
  const next = new Date(Date.UTC(y, m + months, day));
  return next.toISOString().slice(0, 10);
};

const rolePermissions = (role: Role) => {
  const canCreate =
    role === 'Super Admin' ||
    role === 'HR Director' ||
    role === 'HR Manager' ||
    role === 'HR Officer' ||
    role === 'Admin Officer';
  const canViewPayroll = role === 'Super Admin' || role === 'Payroll Officer' || role === 'HR Director' || role === 'HR Manager';
  const canUploadDocuments = canCreate;
  const canSubmitApproval = role === 'Super Admin' || role === 'HR Director' || role === 'HR Manager' || role === 'HR Officer';
  return { canCreate, canViewPayroll, canUploadDocuments, canSubmitApproval };
};

const Card = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className={`bg-white border border-slate-200/60 rounded-2xl shadow-sm ${className || ''}`}>{children}</div>
);

const Chip = ({ label, tone }: { label: string; tone: { bg: string; fg: string } }) => (
  <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-extrabold ${tone.bg} ${tone.fg}`}>{label}</span>
);

const LockBadge = () => (
  <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 text-slate-600 text-[11px] font-extrabold">
    <Lock className="w-3.5 h-3.5" />
    Restricted
  </span>
);

const Field = ({
  label,
  value,
  onChange,
  placeholder,
  required,
  error,
  disabled,
  type,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  required?: boolean;
  error?: string;
  disabled?: boolean;
  type?: 'text' | 'email' | 'tel' | 'date' | 'number';
}) => (
  <div className={`rounded-2xl border p-3 ${error ? 'border-red-200 bg-red-50/40' : disabled ? 'border-slate-100 bg-slate-50' : 'border-slate-200 bg-white'}`}>
    <div className="flex items-center justify-between gap-2">
      <div className="text-[11px] font-extrabold text-slate-600">
        {label} {required ? <span className="text-red-600">*</span> : null}
      </div>
      {error ? (
        <span className="text-[11px] font-extrabold text-red-700 inline-flex items-center gap-1">
          <AlertTriangle className="w-3.5 h-3.5" />
          {error}
        </span>
      ) : null}
    </div>
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      placeholder={placeholder}
      type={type || 'text'}
      className={`mt-1 w-full text-sm font-semibold focus:outline-none ${disabled ? 'bg-transparent text-slate-400' : 'bg-white text-slate-900'}`}
    />
  </div>
);

const TextArea = ({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
}) => (
  <div className="rounded-2xl border border-slate-200 bg-white p-3">
    <div className="text-[11px] font-extrabold text-slate-600">{label}</div>
    <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="mt-1 w-full min-h-[90px] text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-none" />
  </div>
);

const SelectField = ({
  label,
  value,
  onChange,
  options,
  required,
  error,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  options: string[];
  required?: boolean;
  error?: string;
  disabled?: boolean;
}) => (
  <div className={`rounded-2xl border p-3 ${error ? 'border-red-200 bg-red-50/40' : disabled ? 'border-slate-100 bg-slate-50' : 'border-slate-200 bg-white'}`}>
    <div className="flex items-center justify-between gap-2">
      <div className="text-[11px] font-extrabold text-slate-600">
        {label} {required ? <span className="text-red-600">*</span> : null}
      </div>
      {error ? (
        <span className="text-[11px] font-extrabold text-red-700 inline-flex items-center gap-1">
          <AlertTriangle className="w-3.5 h-3.5" />
          {error}
        </span>
      ) : null}
    </div>
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className={`mt-1 w-full text-sm font-semibold focus:outline-none ${disabled ? 'bg-transparent text-slate-400' : 'bg-white text-slate-900'}`}
    >
      <option value="">Select…</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  </div>
);

const Toggle = ({ label, value, onChange }: { label: string; value: boolean; onChange: (next: boolean) => void }) => (
  <button
    type="button"
    onClick={() => onChange(!value)}
    className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-extrabold transition-colors ${
      value ? 'border-dle-blue bg-dle-blue/5 text-dle-blue' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
    }`}
  >
    <span className={`w-3 h-3 rounded-full ${value ? 'bg-dle-blue' : 'bg-slate-300'}`} />
    {label}
  </button>
);

async function apiCall<T>(
  path: string,
  init: RequestInit & { role: Role } = { role: 'HR Officer' }
): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      ...(init.headers || {}),
      'content-type': 'application/json',
      'x-hris-role': init.role,
    },
  });
  const json = (await res.json()) as { status: string; data?: T; error?: string };
  if (!res.ok || json.status !== 'success') throw new Error(json.error || 'Request failed');
  return json.data as T;
}

type StepKey =
  | 'personal'
  | 'contact'
  | 'employment'
  | 'job'
  | 'emergency'
  | 'documents'
  | 'payroll'
  | 'onboarding'
  | 'review';

const STEP_ORDER: { key: StepKey; label: string; icon: any }[] = [
  { key: 'personal', label: 'Personal Information', icon: IdCard },
  { key: 'contact', label: 'Contact Information', icon: Phone },
  { key: 'employment', label: 'Employment Details', icon: BriefcaseBusiness },
  { key: 'job', label: 'Job & Department', icon: Users },
  { key: 'emergency', label: 'Emergency Contact', icon: HeartPulse },
  { key: 'documents', label: 'Documents', icon: FileText },
  { key: 'payroll', label: 'Payroll & Benefits', icon: BadgeCheck },
  { key: 'onboarding', label: 'Onboarding Checklist', icon: ClipboardCheck },
  { key: 'review', label: 'Review & Submit', icon: ShieldCheck },
];

const makeEmptyDraft = (countryDefault: string): EmployeeDraftPayload => ({
  personal: {
    title: '',
    firstName: '',
    middleName: '',
    lastName: '',
    preferredName: '',
    gender: '',
    dateOfBirth: '',
    maritalStatus: '',
    nationality: 'Nigerian',
    stateOfOrigin: '',
    localGovernmentArea: '',
    religion: '',
    languagesSpoken: 'English',
    photoFile: null,
  },
  contact: {
    officialEmail: '',
    personalEmail: '',
    primaryPhone: '',
    alternatePhone: '',
    residentialAddress: '',
    permanentAddress: '',
    nearestBusStop: '',
    city: '',
    state: '',
    country: countryDefault,
    postalCode: '',
    officeExtension: '',
  },
  employment: {
    employeeId: '',
    employmentType: '',
    employmentStatus: 'Active',
    staffCategory: '',
    employeeCategory: '',
    dateJoined: '',
    probationStartDate: '',
    probationEndDate: '',
    confirmationDueDate: '',
    contractStartDate: '',
    contractEndDate: '',
    workMode: '',
    workLocation: '',
    shiftPattern: '',
    unionStatus: '',
    expatriateStatus: '',
    onboardingScheduled: false,
  },
  job: {
    jobTitle: '',
    designation: '',
    jobGrade: '',
    department: '',
    division: '',
    businessUnit: '',
    costCenter: '',
    projectSite: '',
    officeLocation: '',
    reportingManager: '',
    functionalManager: '',
    departmentHead: '',
    hrBusinessPartner: '',
    roleProfile: '',
    jobDescription: '',
    keyResponsibilities: '',
    matrixReporting: false,
    actingPosition: false,
    projectAssignment: false,
    secondment: false,
  },
  emergencyContacts: [],
  documents: [],
  payroll: {
    payrollGroup: '',
    salaryGrade: '',
    basicSalary: '',
    allowancesTemplate: '',
    deductionTemplate: '',
    bankName: '',
    accountNumber: '',
    accountName: '',
    pensionProvider: '',
    pensionPin: '',
    taxId: '',
    nhfNumber: '',
    healthInsurancePlan: '',
    benefitGroup: '',
    setupAssignedToPayroll: true,
  },
  onboardingChecklist: [],
});

export default function AddNewEmployeeClient({ initialNow, initialDraftId }: { initialNow: string; initialDraftId?: string }) {
  const router = useRouter();
  const [role, setRole] = useState<Role>('HR Officer');
  const perms = useMemo(() => rolePermissions(role), [role]);

  const [options, setOptions] = useState<ApiState<FormOptions>>({ status: 'idle' });
  const [draftId, setDraftId] = useState<string | null>(initialDraftId || null);
  const [draftStatus, setDraftStatus] = useState<'draft' | 'submitted' | 'approved' | 'created'>('draft');
  const [draft, setDraft] = useState<EmployeeDraftPayload>(() => makeEmptyDraft('Nigeria'));
  const [step, setStep] = useState<StepKey>('personal');
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ title: string; detail: string; tone: 'ok' | 'warn' | 'err' } | null>(null);

  const [validation, setValidation] = useState<ApiState<ValidationResult>>({ status: 'idle' });
  const [duplicate, setDuplicate] = useState<ApiState<DuplicateResult>>({ status: 'idle' });

  const stepIndex = useMemo(() => STEP_ORDER.findIndex((s) => s.key === step), [step]);
  const nowStamp = useMemo(() => formatDateTimeUtc(initialNow), [initialNow]);
  const nowMs = useMemo(() => new Date(initialNow).getTime(), [initialNow]);

  const countryDefault = 'Nigeria';

  useEffect(() => {
    const loadOptions = async () => {
      setOptions({ status: 'loading' });
      try {
        const data = await apiCall<FormOptions>('/api/hris/employees/form-options', { method: 'GET', role });
        setOptions({ status: 'ready', data });
      } catch (e) {
        setOptions({ status: 'error', error: e instanceof Error ? e.message : 'Unable to load form options' });
      }
    };
    void loadOptions();
  }, [role]);

  useEffect(() => {
    if (!draftId) return;
    const loadDraft = async () => {
      setSaving(true);
      try {
        const res = await apiCall<{ draft: EmployeeDraftPayload; meta: DraftResponse }>(`/api/hris/employees/draft/${encodeURIComponent(draftId)}`, { method: 'GET', role });
        setDraft(res.draft);
        setDraftId(res.meta.draftId);
        setDraftStatus(res.meta.status);
        setToast({ title: 'Draft loaded', detail: `Draft ${res.meta.draftId} loaded at ${nowStamp}`, tone: 'ok' });
      } catch (e) {
        setToast({ title: 'Load failed', detail: e instanceof Error ? e.message : 'Unable to load draft', tone: 'err' });
      } finally {
        setSaving(false);
      }
    };
    void loadDraft();
  }, [draftId, nowStamp, role]);

  const requiredErrors = useMemo(() => {
    const errs: Record<string, string> = {};
    const p = draft.personal;
    const c = draft.contact;
    const e = draft.employment;
    const j = draft.job;
    if (!p.firstName.trim()) errs['personal.firstName'] = 'Required';
    if (!p.lastName.trim()) errs['personal.lastName'] = 'Required';
    if (!p.gender.trim()) errs['personal.gender'] = 'Required';
    if (!p.dateOfBirth.trim()) errs['personal.dateOfBirth'] = 'Required';
    if (p.dateOfBirth.trim()) {
      const dobMs = parseDate(p.dateOfBirth);
      if (dobMs) {
        const age = Math.floor((nowMs - dobMs) / (365.25 * 24 * 3600 * 1000));
        if (age < 18) errs['personal.dateOfBirth'] = 'Min age 18';
      }
    }

    if (c.officialEmail.trim() && !isEmail(c.officialEmail)) errs['contact.officialEmail'] = 'Invalid email';
    if (c.personalEmail.trim() && !isEmail(c.personalEmail)) errs['contact.personalEmail'] = 'Invalid email';
    if (!c.residentialAddress.trim()) errs['contact.residentialAddress'] = 'Required';
    if (c.primaryPhone.trim() && !isPhone(c.primaryPhone)) errs['contact.primaryPhone'] = 'Invalid phone';
    if (c.alternatePhone.trim() && !isPhone(c.alternatePhone)) errs['contact.alternatePhone'] = 'Invalid phone';
    if (!c.country.trim()) errs['contact.country'] = 'Required';

    if (!e.employmentType) errs['employment.employmentType'] = 'Required';
    if (!e.employmentStatus) errs['employment.employmentStatus'] = 'Required';
    if (!e.dateJoined.trim()) errs['employment.dateJoined'] = 'Required';
    if (e.dateJoined.trim()) {
      const dj = parseDate(e.dateJoined);
      if (dj && dj > nowMs && !e.onboardingScheduled) errs['employment.dateJoined'] = 'Future date requires scheduling';
    }
    if (e.employmentType === 'Permanent') {
      if (!e.probationStartDate.trim()) errs['employment.probationStartDate'] = 'Required';
      if (!e.probationEndDate.trim()) errs['employment.probationEndDate'] = 'Required';
      const ps = parseDate(e.probationStartDate);
      const pe = parseDate(e.probationEndDate);
      if (ps && pe && pe < ps) errs['employment.probationEndDate'] = 'End before start';
    }
    if (e.employmentType === 'Contract') {
      if (!e.contractStartDate.trim()) errs['employment.contractStartDate'] = 'Required';
      if (!e.contractEndDate.trim()) errs['employment.contractEndDate'] = 'Required';
      const cs = parseDate(e.contractStartDate);
      const ce = parseDate(e.contractEndDate);
      if (cs && ce && ce < cs) errs['employment.contractEndDate'] = 'End before start';
    }

    if (!j.department.trim()) errs['job.department'] = 'Required';
    if (!j.jobTitle.trim()) errs['job.jobTitle'] = 'Required';
    if (!j.reportingManager.trim()) errs['job.reportingManager'] = 'Required (unless executive)';
    if (j.reportingManager.trim() && `${p.firstName} ${p.lastName}`.trim().toLowerCase() === j.reportingManager.trim().toLowerCase()) errs['job.reportingManager'] = 'Cannot be employee';

    if (draft.emergencyContacts.length === 0) errs['emergency.contacts'] = 'At least one required';
    if (draft.emergencyContacts.length > 0 && !draft.emergencyContacts.some((x) => x.isPrimary)) errs['emergency.primary'] = 'Primary required';
    for (const ec of draft.emergencyContacts) {
      if (!ec.fullName.trim()) errs[`emergency.${ec.id}.fullName`] = 'Required';
      if (!ec.relationship.trim()) errs[`emergency.${ec.id}.relationship`] = 'Required';
      if (!ec.phoneNumber.trim() || !isPhone(ec.phoneNumber)) errs[`emergency.${ec.id}.phoneNumber`] = 'Invalid phone';
    }

    return errs;
  }, [draft, nowMs]);

  const runAI = async () => {
    setValidation({ status: 'loading' });
    setDuplicate({ status: 'loading' });
    try {
      const [vres, dres] = await Promise.all([
        apiCall<ValidationResult>('/api/hris/employees/validate', { method: 'POST', role, body: JSON.stringify({ draft }) }),
        apiCall<DuplicateResult>('/api/hris/employees/duplicate-check', {
          method: 'POST',
          role,
          body: JSON.stringify({
            fullName: `${draft.personal.firstName} ${draft.personal.lastName}`.trim(),
            officialEmail: draft.contact.officialEmail,
            personalEmail: draft.contact.personalEmail,
            primaryPhone: draft.contact.primaryPhone,
            dateOfBirth: draft.personal.dateOfBirth,
            employeeId: draft.employment.employeeId,
          }),
        }),
      ]);
      setValidation({ status: 'ready', data: vres });
      setDuplicate({ status: 'ready', data: dres });
    } catch (e) {
      setValidation({ status: 'error', error: e instanceof Error ? e.message : 'Validation failed' });
      setDuplicate({ status: 'error', error: e instanceof Error ? e.message : 'Duplicate check failed' });
    }
  };

  const saveDraft = async (mode: 'draft' | 'submit-approval') => {
    if (!perms.canCreate) {
      setToast({ title: 'Permission denied', detail: 'You do not have permission to create employee records.', tone: 'err' });
      return;
    }
    setSaving(true);
    try {
      let meta: DraftResponse;
      if (!draftId) {
        meta = await apiCall<DraftResponse>('/api/hris/employees/draft', { method: 'POST', role, body: JSON.stringify({ draft }) });
        setDraftId(meta.draftId);
      } else {
        meta = await apiCall<DraftResponse>(`/api/hris/employees/draft/${encodeURIComponent(draftId)}`, { method: 'PATCH', role, body: JSON.stringify({ draft }) });
      }
      setDraftStatus(meta.status);
      setToast({ title: 'Draft saved', detail: `Draft ${meta.draftId} updated at ${formatDateTimeUtc(meta.updatedAt)}`, tone: 'ok' });
      if (mode === 'submit-approval') {
        if (!perms.canSubmitApproval) {
          setToast({ title: 'Permission denied', detail: 'You do not have permission to submit for approval.', tone: 'err' });
          return;
        }
        const submitted = await apiCall<{ draftId: string; status: 'submitted' }>(`/api/hris/employees/submit-approval`, {
          method: 'POST',
          role,
          body: JSON.stringify({ draftId: meta.draftId }),
        });
        setDraftStatus(submitted.status);
        setToast({ title: 'Submitted', detail: `Draft ${submitted.draftId} submitted for approval.`, tone: 'ok' });
      }
    } catch (e) {
      setToast({ title: 'Save failed', detail: e instanceof Error ? e.message : 'Unable to save draft', tone: 'err' });
    } finally {
      setSaving(false);
    }
  };

  const createEmployee = async (startOnboarding: boolean) => {
    if (!perms.canCreate) {
      setToast({ title: 'Permission denied', detail: 'You do not have permission to create employee records.', tone: 'err' });
      return;
    }
    setSubmitting(true);
    try {
      const did = draftId
        ? draftId
        : (await apiCall<DraftResponse>('/api/hris/employees/draft', { method: 'POST', role, body: JSON.stringify({ draft }) })).draftId;
      setDraftId(did);

      const hardErrors = Object.keys(requiredErrors);
      if (hardErrors.length > 0) {
        setToast({ title: 'Validation failed', detail: `Fix ${hardErrors.length} required fields before creating employee.`, tone: 'err' });
        setSubmitting(false);
        return;
      }

      const res = await apiCall<CreateEmployeeResponse>('/api/hris/employees', {
        method: 'POST',
        role,
        body: JSON.stringify({ draftId: did, mode: startOnboarding ? 'create-and-start-onboarding' : 'create' }),
      });
      setDraftStatus('created');
      setToast({ title: 'Employee created', detail: `Employee ID ${res.employeeId} created. Redirecting to profile…`, tone: 'ok' });
      router.push(`/hris/employees/employee-profile/${encodeURIComponent(res.employeeId)}`);
    } catch (e) {
      setToast({ title: 'Create failed', detail: e instanceof Error ? e.message : 'Unable to create employee', tone: 'err' });
    } finally {
      setSubmitting(false);
    }
  };

  const goNext = () => {
    const next = STEP_ORDER[Math.min(STEP_ORDER.length - 1, stepIndex + 1)]?.key || step;
    setStep(next);
  };
  const goPrev = () => {
    const prev = STEP_ORDER[Math.max(0, stepIndex - 1)]?.key || step;
    setStep(prev);
  };

  const breadcrumb = (
    <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
      <span>HRIS</span>
      <ChevronRight className="w-4 h-4" />
      <span>Employees</span>
      <ChevronRight className="w-4 h-4" />
      <span className="text-slate-700 font-extrabold">Add New Employee</span>
    </div>
  );

  const header = (
    <Card className="p-6">
      <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-6">
        <div className="min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Add New Employee</h1>
            <Chip label={`Step ${stepIndex + 1} / ${STEP_ORDER.length}`} tone={{ bg: 'bg-slate-100', fg: 'text-slate-700' }} />
            <Chip label={`Loaded: ${nowStamp}`} tone={{ bg: 'bg-slate-100', fg: 'text-slate-700' }} />
            {draftId ? <Chip label={`Draft: ${draftId}`} tone={{ bg: 'bg-dle-blue/10', fg: 'text-dle-blue' }} /> : <Chip label="Draft: Not saved" tone={{ bg: 'bg-amber-600/10', fg: 'text-amber-700' }} />}
          </div>
          <div className="text-sm text-slate-600 font-semibold mt-1">
            Create a complete employee master record and initiate onboarding, compliance, payroll, and department assignment workflows.
          </div>
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white">
              <Fingerprint className="w-4 h-4 text-slate-500" />
              <span className="text-xs font-extrabold text-slate-700">Role</span>
              <select value={role} onChange={(e) => setRole(e.target.value as Role)} className="text-xs font-extrabold text-slate-800 bg-white focus:outline-none">
                {[
                  'Super Admin',
                  'HR Director',
                  'HR Manager',
                  'HR Officer',
                  'Admin Officer',
                  'Payroll Officer',
                  'Department Head',
                  'Line Manager',
                  'IT Administrator',
                  'HSE Officer',
                  'Auditor',
                ].map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </span>
            {!perms.canCreate && <LockBadge />}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap justify-end">
          <button type="button" onClick={() => saveDraft('draft')} disabled={!perms.canCreate || saving} className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-extrabold transition-colors ${perms.canCreate ? 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50' : 'bg-slate-100 text-slate-400 border border-slate-200'}`}>
            <Save className="w-4 h-4" />
            Save Draft
          </button>
          <button type="button" onClick={() => setToast({ title: 'Import', detail: 'Import from template is stubbed for now.', tone: 'warn' })} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-extrabold text-slate-700 hover:bg-slate-50 transition-colors">
            <Import className="w-4 h-4" />
            Import Template
          </button>
          <button type="button" onClick={() => setToast({ title: 'Template', detail: 'Template download is stubbed for now.', tone: 'warn' })} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-extrabold text-slate-700 hover:bg-slate-50 transition-colors">
            <Download className="w-4 h-4" />
            Download Template
          </button>
          <Link href="/hris/employees/employee-directory" className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900 text-white text-xs font-extrabold hover:bg-slate-800 transition-colors">
            <X className="w-4 h-4" />
            Cancel
          </Link>
        </div>
      </div>
    </Card>
  );

  const progress = (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap overflow-auto">
          {STEP_ORDER.map((s, idx) => {
            const Icon = s.icon;
            const active = s.key === step;
            const done = idx < stepIndex;
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => setStep(s.key)}
                className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-extrabold whitespace-nowrap transition-colors ${
                  active ? 'border-dle-blue bg-dle-blue/5 text-dle-blue' : done ? 'border-emerald-200 bg-emerald-600/5 text-emerald-700' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <Icon className={`w-4 h-4 ${active ? '' : done ? 'text-emerald-600' : 'text-slate-400'}`} />
                {idx + 1}. {s.label}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={runAI} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-extrabold text-slate-700 hover:bg-slate-50 transition-colors">
            <Sparkles className="w-4 h-4 text-violet-600" />
            Run AI Checks
          </button>
        </div>
      </div>
    </Card>
  );

  const aiPanel = (
    <Card className="overflow-hidden">
      <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-2xl bg-violet-600/10 border border-slate-200/60 flex items-center justify-center text-violet-700">
            <Sparkles className="w-5 h-5" />
          </span>
          <div>
            <div className="text-sm font-extrabold text-slate-900">AI Onboarding Assistant</div>
            <div className="text-xs text-slate-500 font-semibold mt-0.5">Duplicate checks, policy validation, and completeness scoring.</div>
          </div>
        </div>
        <span className="text-[11px] font-extrabold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700">AI snapshot</span>
      </div>

      <div className="p-6 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="rounded-2xl border border-slate-200/60 bg-white p-4">
            <div className="text-[11px] font-extrabold text-slate-600">Profile completeness</div>
            <div className="text-2xl font-extrabold text-slate-900 mt-1">
              {validation.status === 'ready' ? `${validation.data?.completenessPct}%` : '—'}
            </div>
            <div className="text-xs text-slate-500 font-semibold mt-1">AI calculates based on required fields + policy dependencies.</div>
          </div>
          <div className="rounded-2xl border border-slate-200/60 bg-white p-4">
            <div className="text-[11px] font-extrabold text-slate-600">Duplicate detection</div>
            <div className="text-2xl font-extrabold mt-1">
              {duplicate.status === 'ready' ? (
                duplicate.data?.status === 'potential-duplicate' ? (
                  <span className="text-red-700">Potential</span>
                ) : (
                  <span className="text-emerald-700">Clear</span>
                )
              ) : (
                <span className="text-slate-900">—</span>
              )}
            </div>
            <div className="text-xs text-slate-500 font-semibold mt-1">Signals: email, phone, name, DOB.</div>
          </div>
        </div>

        {validation.status === 'ready' && validation.data && (validation.data.errors.length > 0 || validation.data.warnings.length > 0) && (
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs font-extrabold text-slate-700">AI validations</div>
              <span className="text-[11px] font-extrabold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700">
                {formatNumber(validation.data.errors.length)} errors • {formatNumber(validation.data.warnings.length)} warnings
              </span>
            </div>
            <div className="mt-3 space-y-2">
              {validation.data.errors.slice(0, 6).map((e) => (
                <div key={`e:${e.path}`} className="text-xs font-semibold text-red-700 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 mt-0.5" />
                  <span>
                    {e.message} <span className="text-red-500">({e.path})</span>
                  </span>
                </div>
              ))}
              {validation.data.warnings.slice(0, 6).map((w) => (
                <div key={`w:${w.path}`} className="text-xs font-semibold text-amber-700 flex items-start gap-2">
                  <CircleAlert className="w-4 h-4 mt-0.5" />
                  <span>
                    {w.message} <span className="text-amber-600">({w.path})</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {duplicate.status === 'ready' && duplicate.data && duplicate.data.status === 'potential-duplicate' && (
          <div className="rounded-2xl border border-red-200 bg-red-50/30 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs font-extrabold text-red-800">Potential duplicate detected</div>
              <span className="text-[11px] font-extrabold px-2.5 py-1 rounded-full bg-red-600/10 text-red-700">Confidence {Math.round((duplicate.data.confidence || 0) * 100)}%</span>
            </div>
            <div className="mt-2 space-y-1">
              {duplicate.data.matches.slice(0, 6).map((m, i) => (
                <div key={i} className="text-xs font-semibold text-red-700">
                  {m.reason} {m.employeeId ? <span className="text-red-600">• Employee {m.employeeId}</span> : null} {m.draftId ? <span className="text-red-600">• Draft {m.draftId}</span> : null}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="text-xs font-extrabold text-slate-700">Policy hints</div>
          <div className="mt-2 space-y-1 text-xs text-slate-600 font-semibold">
            {draft.employment.employmentType === 'Permanent' && draft.employment.dateJoined.trim() ? (
              <div>
                Probation end date recommendation: {addMonths(draft.employment.dateJoined, 6) || '—'} (6 months after date joined)
              </div>
            ) : null}
            {draft.employment.employmentType === 'Contract' && draft.employment.contractEndDate.trim() ? (
              <div>
                Contract expires on {draft.employment.contractEndDate} • Ensure employment letter and contract agreement uploaded.
              </div>
            ) : null}
            {draft.emergencyContacts.length === 0 ? <div>Emergency contact is missing</div> : null}
            {draft.documents.length === 0 ? <div>Document checklist recommendation: upload Government ID, CV/Resume, Employment/Offer letter</div> : null}
          </div>
        </div>
      </div>
    </Card>
  );

  const stepCard = (title: string, icon: any, children: React.ReactNode, actions?: React.ReactNode) => {
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

  const personalStep = stepCard(
    'Step 1 — Personal Information',
    IdCard,
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      <SelectField label="Title" value={draft.personal.title} onChange={(v) => setDraft((d) => ({ ...d, personal: { ...d.personal, title: v } }))} options={['Mr', 'Mrs', 'Ms', 'Dr', 'Engr']} />
      <Field label="First Name" required value={draft.personal.firstName} onChange={(v) => setDraft((d) => ({ ...d, personal: { ...d.personal, firstName: v } }))} error={requiredErrors['personal.firstName']} />
      <Field label="Middle Name" value={draft.personal.middleName} onChange={(v) => setDraft((d) => ({ ...d, personal: { ...d.personal, middleName: v } }))} />
      <Field label="Last Name" required value={draft.personal.lastName} onChange={(v) => setDraft((d) => ({ ...d, personal: { ...d.personal, lastName: v } }))} error={requiredErrors['personal.lastName']} />
      <Field label="Preferred Name" value={draft.personal.preferredName} onChange={(v) => setDraft((d) => ({ ...d, personal: { ...d.personal, preferredName: v } }))} />
      <SelectField
        label="Gender"
        required
        value={draft.personal.gender}
        onChange={(v) => setDraft((d) => ({ ...d, personal: { ...d.personal, gender: v } }))}
        options={['Male', 'Female']}
        error={requiredErrors['personal.gender']}
      />
      <Field
        label="Date of Birth"
        required
        type="date"
        value={draft.personal.dateOfBirth}
        onChange={(v) => setDraft((d) => ({ ...d, personal: { ...d.personal, dateOfBirth: v } }))}
        error={requiredErrors['personal.dateOfBirth']}
      />
      <SelectField label="Marital Status" value={draft.personal.maritalStatus} onChange={(v) => setDraft((d) => ({ ...d, personal: { ...d.personal, maritalStatus: v } }))} options={['Single', 'Married', 'Divorced', 'Widowed']} />
      <Field label="Nationality" value={draft.personal.nationality} onChange={(v) => setDraft((d) => ({ ...d, personal: { ...d.personal, nationality: v } }))} />
      <Field label="State of Origin" value={draft.personal.stateOfOrigin} onChange={(v) => setDraft((d) => ({ ...d, personal: { ...d.personal, stateOfOrigin: v } }))} />
      <Field label="Local Government Area" value={draft.personal.localGovernmentArea} onChange={(v) => setDraft((d) => ({ ...d, personal: { ...d.personal, localGovernmentArea: v } }))} />
      <Field label="Religion" value={draft.personal.religion} onChange={(v) => setDraft((d) => ({ ...d, personal: { ...d.personal, religion: v } }))} />
      <Field label="Languages Spoken" value={draft.personal.languagesSpoken} onChange={(v) => setDraft((d) => ({ ...d, personal: { ...d.personal, languagesSpoken: v } }))} />
      <div className="rounded-2xl border border-slate-200 bg-white p-3 lg:col-span-3">
        <div className="flex items-center justify-between gap-3">
          <div className="text-[11px] font-extrabold text-slate-600">Passport Photograph</div>
          {draft.personal.photoFile ? (
            <span className="text-[11px] font-extrabold px-2.5 py-1 rounded-full bg-emerald-600/10 text-emerald-700">Selected</span>
          ) : (
            <span className="text-[11px] font-extrabold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700">Not selected</span>
          )}
        </div>
        <div className="mt-2 flex items-center gap-3 flex-wrap">
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) {
                setDraft((d) => ({ ...d, personal: { ...d.personal, photoFile: null } }));
                return;
              }
              const okType = ['image/png', 'image/jpeg', 'image/webp'].includes(f.type);
              const okSize = f.size <= 5 * 1024 * 1024;
              if (!okType || !okSize) {
                setToast({ title: 'Invalid photo', detail: 'Photo must be JPG/PNG/WebP and <= 5MB.', tone: 'err' });
                return;
              }
              setDraft((d) => ({ ...d, personal: { ...d.personal, photoFile: { fileName: f.name, mimeType: f.type, sizeBytes: f.size } } }));
            }}
          />
          {draft.personal.photoFile ? (
            <div className="text-xs text-slate-600 font-semibold">
              {draft.personal.photoFile.fileName} • {formatNumber(Math.ceil(draft.personal.photoFile.sizeBytes / 1024))} KB
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );

  const contactStep = stepCard(
    'Step 2 — Contact Information',
    Phone,
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      <Field label="Official Email" type="email" value={draft.contact.officialEmail} onChange={(v) => setDraft((d) => ({ ...d, contact: { ...d.contact, officialEmail: v } }))} error={requiredErrors['contact.officialEmail']} />
      <Field label="Personal Email" type="email" value={draft.contact.personalEmail} onChange={(v) => setDraft((d) => ({ ...d, contact: { ...d.contact, personalEmail: v } }))} error={requiredErrors['contact.personalEmail']} />
      <Field label="Primary Phone Number" type="tel" value={draft.contact.primaryPhone} onChange={(v) => setDraft((d) => ({ ...d, contact: { ...d.contact, primaryPhone: v } }))} error={requiredErrors['contact.primaryPhone']} />
      <Field label="Alternate Phone Number" type="tel" value={draft.contact.alternatePhone} onChange={(v) => setDraft((d) => ({ ...d, contact: { ...d.contact, alternatePhone: v } }))} error={requiredErrors['contact.alternatePhone']} />
      <Field label="Residential Address" required value={draft.contact.residentialAddress} onChange={(v) => setDraft((d) => ({ ...d, contact: { ...d.contact, residentialAddress: v } }))} error={requiredErrors['contact.residentialAddress']} />
      <Field label="Permanent Address" value={draft.contact.permanentAddress} onChange={(v) => setDraft((d) => ({ ...d, contact: { ...d.contact, permanentAddress: v } }))} />
      <Field label="Nearest Bus Stop" value={draft.contact.nearestBusStop} onChange={(v) => setDraft((d) => ({ ...d, contact: { ...d.contact, nearestBusStop: v } }))} />
      <Field label="City" value={draft.contact.city} onChange={(v) => setDraft((d) => ({ ...d, contact: { ...d.contact, city: v } }))} />
      <Field label="State" value={draft.contact.state} onChange={(v) => setDraft((d) => ({ ...d, contact: { ...d.contact, state: v } }))} />
      <Field label="Country" required value={draft.contact.country} onChange={(v) => setDraft((d) => ({ ...d, contact: { ...d.contact, country: v } }))} error={requiredErrors['contact.country']} placeholder={countryDefault} />
      <Field label="Postal Code" value={draft.contact.postalCode} onChange={(v) => setDraft((d) => ({ ...d, contact: { ...d.contact, postalCode: v } }))} />
      <Field label="Office Extension" value={draft.contact.officeExtension} onChange={(v) => setDraft((d) => ({ ...d, contact: { ...d.contact, officeExtension: v } }))} />
    </div>
  );

  const employmentStep = stepCard(
    'Step 3 — Employment Details',
    BriefcaseBusiness,
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <Field label="Employee ID (optional)" value={draft.employment.employeeId} onChange={(v) => setDraft((d) => ({ ...d, employment: { ...d.employment, employeeId: v } }))} placeholder="Auto-generated if blank" />
        <SelectField
          label="Employment Type"
          required
          value={draft.employment.employmentType}
          onChange={(v) => setDraft((d) => ({ ...d, employment: { ...d.employment, employmentType: v as EmploymentType } }))}
          options={['Permanent', 'Contract', 'Temporary', 'Intern', 'Consultant', 'Expatriate', 'Industrial Trainee', 'NYSC', 'Outsourced Staff']}
          error={requiredErrors['employment.employmentType']}
        />
        <SelectField
          label="Employment Status"
          required
          value={draft.employment.employmentStatus}
          onChange={(v) => setDraft((d) => ({ ...d, employment: { ...d.employment, employmentStatus: v as EmploymentStatus } }))}
          options={['Active', 'On Leave', 'Probation', 'Confirmed', 'Suspended', 'Resigned', 'Terminated', 'Retired', 'Contract', 'Seconded', 'Field Assignment']}
          error={requiredErrors['employment.employmentStatus']}
        />
        <SelectField label="Staff Category" value={draft.employment.staffCategory} onChange={(v) => setDraft((d) => ({ ...d, employment: { ...d.employment, staffCategory: v } }))} options={options.data?.staffCategories || []} />
        <SelectField label="Employee Category" value={draft.employment.employeeCategory} onChange={(v) => setDraft((d) => ({ ...d, employment: { ...d.employment, employeeCategory: v } }))} options={options.data?.employeeCategories || []} />
        <Field
          label="Date Joined"
          required
          type="date"
          value={draft.employment.dateJoined}
          onChange={(v) => {
            setDraft((d) => ({ ...d, employment: { ...d.employment, dateJoined: v } }));
            const suggested = addMonths(v, 6);
            if (draft.employment.employmentType === 'Permanent' && suggested) {
              setDraft((d) => ({
                ...d,
                employment: { ...d.employment, probationStartDate: d.employment.probationStartDate || v, probationEndDate: d.employment.probationEndDate || suggested, confirmationDueDate: d.employment.confirmationDueDate || suggested },
              }));
            }
          }}
          error={requiredErrors['employment.dateJoined']}
        />
        <div className="flex items-center gap-2 flex-wrap lg:col-span-3">
          <Toggle label="Onboarding scheduled (future join date allowed)" value={draft.employment.onboardingScheduled} onChange={(v) => setDraft((d) => ({ ...d, employment: { ...d.employment, onboardingScheduled: v } }))} />
        </div>
      </div>

      {draft.employment.employmentType === 'Permanent' && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-extrabold text-slate-700">Probation setup (required for Permanent)</div>
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <Field label="Probation Start Date" required type="date" value={draft.employment.probationStartDate} onChange={(v) => setDraft((d) => ({ ...d, employment: { ...d.employment, probationStartDate: v } }))} error={requiredErrors['employment.probationStartDate']} />
            <Field label="Probation End Date" required type="date" value={draft.employment.probationEndDate} onChange={(v) => setDraft((d) => ({ ...d, employment: { ...d.employment, probationEndDate: v } }))} error={requiredErrors['employment.probationEndDate']} />
            <Field label="Confirmation Due Date" type="date" value={draft.employment.confirmationDueDate} onChange={(v) => setDraft((d) => ({ ...d, employment: { ...d.employment, confirmationDueDate: v } }))} />
          </div>
        </div>
      )}

      {draft.employment.employmentType === 'Contract' && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-extrabold text-slate-700">Contract setup (required for Contract)</div>
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <Field label="Contract Start Date" required type="date" value={draft.employment.contractStartDate} onChange={(v) => setDraft((d) => ({ ...d, employment: { ...d.employment, contractStartDate: v } }))} error={requiredErrors['employment.contractStartDate']} />
            <Field label="Contract End Date" required type="date" value={draft.employment.contractEndDate} onChange={(v) => setDraft((d) => ({ ...d, employment: { ...d.employment, contractEndDate: v } }))} error={requiredErrors['employment.contractEndDate']} />
            <Field label="Union Status" value={draft.employment.unionStatus} onChange={(v) => setDraft((d) => ({ ...d, employment: { ...d.employment, unionStatus: v } }))} />
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <SelectField label="Work Mode" value={draft.employment.workMode} onChange={(v) => setDraft((d) => ({ ...d, employment: { ...d.employment, workMode: v } }))} options={options.data?.workModes || []} />
        <SelectField label="Work Location" value={draft.employment.workLocation} onChange={(v) => setDraft((d) => ({ ...d, employment: { ...d.employment, workLocation: v } }))} options={options.data?.locations || []} />
        <SelectField label="Shift Pattern" value={draft.employment.shiftPattern} onChange={(v) => setDraft((d) => ({ ...d, employment: { ...d.employment, shiftPattern: v } }))} options={options.data?.shiftPatterns || []} />
        <Field label="Union Status" value={draft.employment.unionStatus} onChange={(v) => setDraft((d) => ({ ...d, employment: { ...d.employment, unionStatus: v } }))} />
        <Field label="Expatriate Status" value={draft.employment.expatriateStatus} onChange={(v) => setDraft((d) => ({ ...d, employment: { ...d.employment, expatriateStatus: v } }))} />
      </div>
    </div>
  );

  const jobStep = stepCard(
    'Step 4 — Job & Department Assignment',
    Users,
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <SelectField label="Job Title" required value={draft.job.jobTitle} onChange={(v) => setDraft((d) => ({ ...d, job: { ...d.job, jobTitle: v } }))} options={options.data?.jobTitles || []} error={requiredErrors['job.jobTitle']} />
        <Field label="Designation" value={draft.job.designation} onChange={(v) => setDraft((d) => ({ ...d, job: { ...d.job, designation: v } }))} />
        <SelectField label="Job Grade" value={draft.job.jobGrade} onChange={(v) => setDraft((d) => ({ ...d, job: { ...d.job, jobGrade: v } }))} options={options.data?.jobGrades || []} />
        <SelectField label="Department" required value={draft.job.department} onChange={(v) => setDraft((d) => ({ ...d, job: { ...d.job, department: v } }))} options={options.data?.departments || []} error={requiredErrors['job.department']} />
        <SelectField label="Division" value={draft.job.division} onChange={(v) => setDraft((d) => ({ ...d, job: { ...d.job, division: v } }))} options={options.data?.divisions || []} />
        <SelectField label="Business Unit" value={draft.job.businessUnit} onChange={(v) => setDraft((d) => ({ ...d, job: { ...d.job, businessUnit: v } }))} options={options.data?.businessUnits || []} />
        <SelectField label="Cost Center" value={draft.job.costCenter} onChange={(v) => setDraft((d) => ({ ...d, job: { ...d.job, costCenter: v } }))} options={options.data?.costCenters || []} />
        <SelectField label="Project Site" value={draft.job.projectSite} onChange={(v) => setDraft((d) => ({ ...d, job: { ...d.job, projectSite: v } }))} options={options.data?.projectSites || []} />
        <SelectField label="Office Location" value={draft.job.officeLocation} onChange={(v) => setDraft((d) => ({ ...d, job: { ...d.job, officeLocation: v } }))} options={options.data?.locations || []} />
        <Field label="Reporting Manager" required value={draft.job.reportingManager} onChange={(v) => setDraft((d) => ({ ...d, job: { ...d.job, reportingManager: v } }))} error={requiredErrors['job.reportingManager']} placeholder="Manager full name or employee ID" />
        <Field label="Functional Manager" value={draft.job.functionalManager} onChange={(v) => setDraft((d) => ({ ...d, job: { ...d.job, functionalManager: v } }))} />
        <Field label="Department Head" value={draft.job.departmentHead} onChange={(v) => setDraft((d) => ({ ...d, job: { ...d.job, departmentHead: v } }))} />
        <Field label="HR Business Partner" value={draft.job.hrBusinessPartner} onChange={(v) => setDraft((d) => ({ ...d, job: { ...d.job, hrBusinessPartner: v } }))} />
        <SelectField label="Role Profile" value={draft.job.roleProfile} onChange={(v) => setDraft((d) => ({ ...d, job: { ...d.job, roleProfile: v } }))} options={options.data?.roleProfiles || []} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <TextArea label="Job Description" value={draft.job.jobDescription} onChange={(v) => setDraft((d) => ({ ...d, job: { ...d.job, jobDescription: v } }))} placeholder="Role description (future-ready for AI role profile parsing)" />
        <TextArea label="Key Responsibilities" value={draft.job.keyResponsibilities} onChange={(v) => setDraft((d) => ({ ...d, job: { ...d.job, keyResponsibilities: v } }))} placeholder="Responsibilities and KPIs" />
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <Toggle label="Matrix reporting" value={draft.job.matrixReporting} onChange={(v) => setDraft((d) => ({ ...d, job: { ...d.job, matrixReporting: v } }))} />
        <Toggle label="Temporary assignment" value={draft.job.projectAssignment} onChange={(v) => setDraft((d) => ({ ...d, job: { ...d.job, projectAssignment: v } }))} />
        <Toggle label="Acting position" value={draft.job.actingPosition} onChange={(v) => setDraft((d) => ({ ...d, job: { ...d.job, actingPosition: v } }))} />
        <Toggle label="Secondment" value={draft.job.secondment} onChange={(v) => setDraft((d) => ({ ...d, job: { ...d.job, secondment: v } }))} />
      </div>
    </div>
  );

  const emergencyStep = stepCard(
    'Step 5 — Emergency Contacts',
    HeartPulse,
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-xs text-slate-600 font-semibold">
          At least one emergency contact is required and one must be marked primary. {requiredErrors['emergency.contacts'] || requiredErrors['emergency.primary'] ? <span className="text-red-700 font-extrabold">Validation required</span> : null}
        </div>
        <button
          type="button"
          onClick={() =>
            setDraft((d) => ({
              ...d,
              emergencyContacts: [
                {
                  id: `ec-${Math.random().toString(16).slice(2)}`,
                  fullName: '',
                  relationship: '',
                  phoneNumber: '',
                  alternatePhone: '',
                  email: '',
                  address: '',
                  isPrimary: d.emergencyContacts.length === 0,
                  isNextOfKin: true,
                  isBeneficiary: false,
                },
                ...d.emergencyContacts,
              ],
            }))
          }
          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900 text-white text-xs font-extrabold hover:bg-slate-800 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Contact
        </button>
      </div>

      <div className="space-y-3">
        {draft.emergencyContacts.map((c) => (
          <div key={c.id} className="rounded-2xl border border-slate-200/60 bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 w-full">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-extrabold text-slate-900">Emergency Contact</div>
                  <div className="flex items-center gap-2">
                    {c.isPrimary ? <Chip label="Primary" tone={{ bg: 'bg-emerald-600/10', fg: 'text-emerald-700' }} /> : null}
                    <button
                      type="button"
                      onClick={() =>
                        setDraft((d) => ({ ...d, emergencyContacts: d.emergencyContacts.filter((x) => x.id !== c.id) }))
                      }
                      className="p-2 rounded-xl border border-red-200 hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4 text-red-700" />
                    </button>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  <Field label="Full Name" required value={c.fullName} onChange={(v) => setDraft((d) => ({ ...d, emergencyContacts: d.emergencyContacts.map((x) => (x.id === c.id ? { ...x, fullName: v } : x)) }))} error={requiredErrors[`emergency.${c.id}.fullName`]} />
                  <Field label="Relationship" required value={c.relationship} onChange={(v) => setDraft((d) => ({ ...d, emergencyContacts: d.emergencyContacts.map((x) => (x.id === c.id ? { ...x, relationship: v } : x)) }))} error={requiredErrors[`emergency.${c.id}.relationship`]} />
                  <Field label="Phone Number" required type="tel" value={c.phoneNumber} onChange={(v) => setDraft((d) => ({ ...d, emergencyContacts: d.emergencyContacts.map((x) => (x.id === c.id ? { ...x, phoneNumber: v } : x)) }))} error={requiredErrors[`emergency.${c.id}.phoneNumber`]} />
                  <Field label="Alternate Phone" type="tel" value={c.alternatePhone} onChange={(v) => setDraft((d) => ({ ...d, emergencyContacts: d.emergencyContacts.map((x) => (x.id === c.id ? { ...x, alternatePhone: v } : x)) }))} />
                  <Field label="Email" type="email" value={c.email} onChange={(v) => setDraft((d) => ({ ...d, emergencyContacts: d.emergencyContacts.map((x) => (x.id === c.id ? { ...x, email: v } : x)) }))} />
                  <Field label="Address" value={c.address} onChange={(v) => setDraft((d) => ({ ...d, emergencyContacts: d.emergencyContacts.map((x) => (x.id === c.id ? { ...x, address: v } : x)) }))} />
                </div>
                <div className="mt-3 flex items-center gap-2 flex-wrap">
                  <Toggle
                    label="Primary Contact"
                    value={c.isPrimary}
                    onChange={(v) =>
                      setDraft((d) => ({
                        ...d,
                        emergencyContacts: d.emergencyContacts.map((x) => (x.id === c.id ? { ...x, isPrimary: v } : { ...x, isPrimary: v ? false : x.isPrimary })),
                      }))
                    }
                  />
                  <Toggle label="Next of Kin" value={c.isNextOfKin} onChange={(v) => setDraft((d) => ({ ...d, emergencyContacts: d.emergencyContacts.map((x) => (x.id === c.id ? { ...x, isNextOfKin: v } : x)) }))} />
                  <Toggle label="Beneficiary" value={c.isBeneficiary} onChange={(v) => setDraft((d) => ({ ...d, emergencyContacts: d.emergencyContacts.map((x) => (x.id === c.id ? { ...x, isBeneficiary: v } : x)) }))} />
                </div>
              </div>
            </div>
          </div>
        ))}
        {draft.emergencyContacts.length === 0 ? <div className="text-sm text-slate-600 font-semibold">No emergency contacts added.</div> : null}
      </div>
    </div>
  );

  const documentsStep = stepCard(
    'Step 6 — Documents',
    FileText,
    <div className="space-y-5">
      {!perms.canUploadDocuments ? (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 font-semibold">You do not have permission to upload documents.</div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="text-xs font-extrabold text-slate-700">Upload documents</div>
            <span className="text-[11px] font-extrabold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700">File types: PDF/JPG/PNG</span>
          </div>
          <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
            <SelectField
              label="Category"
              value=""
              onChange={(category) => {
                setToast({ title: 'Select file', detail: `Selected category: ${category}. Choose file to attach.`, tone: 'ok' });
              }}
              options={[
                'CV / Resume',
                'Employment Letter',
                'Offer Letter',
                'Academic Certificate',
                'Professional Certificate',
                'Government ID',
                'Passport',
                'NIN',
                'BVN',
                'Tax Document',
                'Guarantor Form',
                'Reference Letter',
                'Medical Fitness Certificate',
                'Contract Agreement',
                'Passport Photograph',
              ]}
            />
            <Field label="Expiry date (optional)" type="date" value="" onChange={() => {}} disabled />
            <div className="rounded-2xl border border-slate-200 bg-white p-3">
              <div className="text-[11px] font-extrabold text-slate-600">File</div>
              <input
                type="file"
                accept="application/pdf,image/png,image/jpeg"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  const ok = ['application/pdf', 'image/png', 'image/jpeg'].includes(f.type) && f.size <= 15 * 1024 * 1024;
                  if (!ok) {
                    setToast({ title: 'Invalid file', detail: 'File must be PDF/JPG/PNG and <= 15MB.', tone: 'err' });
                    return;
                  }
                  setDraft((d) => ({
                    ...d,
                    documents: [
                      {
                        id: `doc-${Math.random().toString(16).slice(2)}`,
                        category: 'Government ID',
                        fileName: f.name,
                        mimeType: f.type,
                        sizeBytes: f.size,
                        expiresAt: '',
                        status: 'Pending',
                      },
                      ...d.documents,
                    ],
                  }));
                }}
              />
              <div className="text-[11px] text-slate-500 font-semibold mt-2">Drag/drop and secure storage will be wired to encrypted document storage.</div>
            </div>
          </div>
          <div className="mt-3">
            <button
              type="button"
              onClick={async () => {
                if (!draftId) {
                  await saveDraft('draft');
                  return;
                }
                try {
                  const pending = draft.documents.filter((x) => x.status === 'Pending');
                  if (pending.length === 0) {
                    setToast({ title: 'No pending documents', detail: 'Add files first before uploading.', tone: 'warn' });
                    return;
                  }
                  await apiCall<{ uploaded: number }>(`/api/hris/employees/documents/upload`, {
                    method: 'POST',
                    role,
                    body: JSON.stringify({ draftId, documents: pending }),
                  });
                  setDraft((d) => ({ ...d, documents: d.documents.map((x) => (x.status === 'Pending' ? { ...x, status: 'Uploaded' } : x)) }));
                  setToast({ title: 'Uploaded', detail: `Uploaded ${formatNumber(pending.length)} document(s).`, tone: 'ok' });
                } catch (e) {
                  setToast({ title: 'Upload failed', detail: e instanceof Error ? e.message : 'Unable to upload', tone: 'err' });
                }
              }}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900 text-white text-xs font-extrabold hover:bg-slate-800 transition-colors"
            >
              <Upload className="w-4 h-4" />
              Upload Pending
            </button>
          </div>
        </div>
      )}

      <div className="divide-y divide-slate-100 border border-slate-200/60 rounded-2xl overflow-hidden">
        {draft.documents.slice(0, 40).map((d) => (
          <div key={d.id} className="px-5 py-4 bg-white flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-extrabold text-slate-900">{d.category}</div>
              <div className="text-xs text-slate-500 font-semibold mt-1">
                {d.fileName} <span className="mx-2">•</span> {formatNumber(Math.ceil(d.sizeBytes / 1024))} KB
              </div>
              <div className="text-xs text-slate-600 font-semibold mt-1">
                Status:{' '}
                <span className={`font-extrabold ${d.status === 'Uploaded' ? 'text-emerald-700' : d.status === 'Rejected' ? 'text-red-700' : 'text-slate-700'}`}>{d.status}</span>
              </div>
            </div>
            <button type="button" onClick={() => setDraft((x) => ({ ...x, documents: x.documents.filter((k) => k.id !== d.id) }))} className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50">
              <Trash2 className="w-4 h-4 text-slate-600" />
            </button>
          </div>
        ))}
        {draft.documents.length === 0 ? <div className="px-5 py-6 text-sm text-slate-600 font-semibold bg-white">No documents attached.</div> : null}
      </div>
    </div>
  );

  const payrollStep = stepCard(
    'Step 7 — Payroll & Benefits Setup',
    BadgeCheck,
    !perms.canViewPayroll ? (
      <div className="space-y-4">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 font-semibold">Payroll setup is restricted. You can save the draft and assign payroll setup to Payroll Officer workflow.</div>
        <Toggle label="Assign payroll setup to Payroll Officer" value={draft.payroll.setupAssignedToPayroll} onChange={(v) => setDraft((d) => ({ ...d, payroll: { ...d.payroll, setupAssignedToPayroll: v } }))} />
      </div>
    ) : (
      <div className="space-y-5">
        <div className="flex items-center gap-2 flex-wrap">
          <Toggle label="Assign payroll setup to Payroll Officer workflow" value={draft.payroll.setupAssignedToPayroll} onChange={(v) => setDraft((d) => ({ ...d, payroll: { ...d.payroll, setupAssignedToPayroll: v } }))} />
          <span className="text-xs text-slate-500 font-semibold">Bank and salary data must be protected and audited.</span>
        </div>
        <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 ${draft.payroll.setupAssignedToPayroll ? 'opacity-60 pointer-events-none' : ''}`}>
          <SelectField label="Payroll Group" value={draft.payroll.payrollGroup} onChange={(v) => setDraft((d) => ({ ...d, payroll: { ...d.payroll, payrollGroup: v } }))} options={options.data?.payrollGroups || []} />
          <SelectField label="Salary Grade" value={draft.payroll.salaryGrade} onChange={(v) => setDraft((d) => ({ ...d, payroll: { ...d.payroll, salaryGrade: v } }))} options={options.data?.salaryGrades || []} />
          <Field label="Basic Salary" type="number" value={draft.payroll.basicSalary} onChange={(v) => setDraft((d) => ({ ...d, payroll: { ...d.payroll, basicSalary: v } }))} />
          <Field label="Allowances Template" value={draft.payroll.allowancesTemplate} onChange={(v) => setDraft((d) => ({ ...d, payroll: { ...d.payroll, allowancesTemplate: v } }))} />
          <Field label="Deduction Template" value={draft.payroll.deductionTemplate} onChange={(v) => setDraft((d) => ({ ...d, payroll: { ...d.payroll, deductionTemplate: v } }))} />
          <SelectField label="Bank Name" value={draft.payroll.bankName} onChange={(v) => setDraft((d) => ({ ...d, payroll: { ...d.payroll, bankName: v } }))} options={options.data?.banks || []} />
          <Field label="Account Number" value={draft.payroll.accountNumber} onChange={(v) => setDraft((d) => ({ ...d, payroll: { ...d.payroll, accountNumber: v } }))} />
          <Field label="Account Name" value={draft.payroll.accountName} onChange={(v) => setDraft((d) => ({ ...d, payroll: { ...d.payroll, accountName: v } }))} />
          <SelectField label="Pension Provider" value={draft.payroll.pensionProvider} onChange={(v) => setDraft((d) => ({ ...d, payroll: { ...d.payroll, pensionProvider: v } }))} options={options.data?.pensionProviders || []} />
          <Field label="Pension PIN" value={draft.payroll.pensionPin} onChange={(v) => setDraft((d) => ({ ...d, payroll: { ...d.payroll, pensionPin: v } }))} />
          <Field label="Tax ID" value={draft.payroll.taxId} onChange={(v) => setDraft((d) => ({ ...d, payroll: { ...d.payroll, taxId: v } }))} />
          <Field label="NHF Number" value={draft.payroll.nhfNumber} onChange={(v) => setDraft((d) => ({ ...d, payroll: { ...d.payroll, nhfNumber: v } }))} />
          <Field label="Health Insurance Plan" value={draft.payroll.healthInsurancePlan} onChange={(v) => setDraft((d) => ({ ...d, payroll: { ...d.payroll, healthInsurancePlan: v } }))} />
          <SelectField label="Benefit Group" value={draft.payroll.benefitGroup} onChange={(v) => setDraft((d) => ({ ...d, payroll: { ...d.payroll, benefitGroup: v } }))} options={options.data?.benefitGroups || []} />
        </div>
      </div>
    )
  );

  const onboardingStep = stepCard(
    'Step 8 — Onboarding Checklist',
    ClipboardCheck,
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-xs text-slate-600 font-semibold">Checklist generates onboarding tasks and assignments. All actions are audited.</div>
        <button
          type="button"
          onClick={async () => {
            try {
              const template = await apiCall<ChecklistItem[]>('/api/hris/employees/onboarding/checklist-template', { method: 'GET', role });
              setDraft((d) => ({ ...d, onboardingChecklist: template }));
              setToast({ title: 'Checklist generated', detail: `Loaded ${formatNumber(template.length)} items.`, tone: 'ok' });
            } catch (e) {
              setToast({ title: 'Load failed', detail: e instanceof Error ? e.message : 'Unable to load checklist template', tone: 'err' });
            }
          }}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-extrabold text-slate-700 hover:bg-slate-50 transition-colors"
        >
          <ClipboardList className="w-4 h-4" />
          Load Template
        </button>
      </div>

      <div className="overflow-auto border border-slate-200/60 rounded-2xl">
        <table className="w-full text-left bg-white">
          <thead className="bg-slate-50 border-b border-slate-100">
            <tr>
              <th className="px-4 py-3 text-[11px] font-extrabold text-slate-600">Item</th>
              <th className="px-4 py-3 text-[11px] font-extrabold text-slate-600">Status</th>
              <th className="px-4 py-3 text-[11px] font-extrabold text-slate-600">Responsible</th>
              <th className="px-4 py-3 text-[11px] font-extrabold text-slate-600">Due</th>
              <th className="px-4 py-3 text-[11px] font-extrabold text-slate-600">Notes</th>
            </tr>
          </thead>
          <tbody>
            {draft.onboardingChecklist.map((t) => (
              <tr key={t.id} className="border-b border-slate-100">
                <td className="px-4 py-3 text-sm font-extrabold text-slate-900">{t.title}</td>
                <td className="px-4 py-3">
                  <select
                    value={t.status}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, onboardingChecklist: d.onboardingChecklist.map((x) => (x.id === t.id ? { ...x, status: e.target.value as ChecklistItem['status'] } : x)) }))
                    }
                    className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-extrabold text-slate-700 focus:outline-none"
                  >
                    {['Pending', 'In Progress', 'Done', 'Blocked'].map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3">
                  <input
                    value={t.responsibleOfficer}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, onboardingChecklist: d.onboardingChecklist.map((x) => (x.id === t.id ? { ...x, responsibleOfficer: e.target.value } : x)) }))
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-800 focus:outline-none"
                    placeholder="HR / IT / HSE / Manager"
                  />
                </td>
                <td className="px-4 py-3">
                  <input
                    value={t.dueDate}
                    onChange={(e) => setDraft((d) => ({ ...d, onboardingChecklist: d.onboardingChecklist.map((x) => (x.id === t.id ? { ...x, dueDate: e.target.value } : x)) }))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-800 focus:outline-none"
                    placeholder={todayIso(initialNow)}
                  />
                </td>
                <td className="px-4 py-3">
                  <input
                    value={t.notes}
                    onChange={(e) => setDraft((d) => ({ ...d, onboardingChecklist: d.onboardingChecklist.map((x) => (x.id === t.id ? { ...x, notes: e.target.value } : x)) }))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-800 focus:outline-none"
                    placeholder="Notes..."
                  />
                </td>
              </tr>
            ))}
            {draft.onboardingChecklist.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-10 text-center text-sm text-slate-600 font-semibold">
                  No checklist items. Load template to generate onboarding tasks.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );

  const reviewStep = stepCard(
    'Step 9 — Review & Submit',
    ShieldCheck,
    <div className="space-y-6">
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card className="p-5">
          <div className="text-sm font-extrabold text-slate-900">AI Validation Summary</div>
          <div className="text-xs text-slate-500 font-semibold mt-1">Run AI checks before submission for approval.</div>
          <div className="mt-4 flex items-center gap-2 flex-wrap">
            <button type="button" onClick={runAI} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900 text-white text-xs font-extrabold hover:bg-slate-800 transition-colors">
              <Sparkles className="w-4 h-4" />
              Run AI Checks
            </button>
            {validation.status === 'ready' && validation.data ? (
              <Chip label={`Completeness ${validation.data.completenessPct}%`} tone={{ bg: 'bg-blue-600/10', fg: 'text-blue-700' }} />
            ) : (
              <Chip label="Completeness —" tone={{ bg: 'bg-slate-100', fg: 'text-slate-700' }} />
            )}
            {duplicate.status === 'ready' && duplicate.data ? (
              <Chip label={`Duplicate: ${duplicate.data.status}`} tone={duplicate.data.status === 'potential-duplicate' ? { bg: 'bg-red-600/10', fg: 'text-red-700' } : { bg: 'bg-emerald-600/10', fg: 'text-emerald-700' }} />
            ) : (
              <Chip label="Duplicate —" tone={{ bg: 'bg-slate-100', fg: 'text-slate-700' }} />
            )}
          </div>
        </Card>

        <Card className="p-5">
          <div className="text-sm font-extrabold text-slate-900">Validation Status</div>
          <div className="text-xs text-slate-500 font-semibold mt-1">Hard requirements must be satisfied to create employee.</div>
          <div className="mt-4">
            {Object.keys(requiredErrors).length === 0 ? (
              <div className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-600/10 text-emerald-700 text-xs font-extrabold">
                <CheckCircle2 className="w-4 h-4" />
                All required fields satisfied
              </div>
            ) : (
              <div className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-red-600/10 text-red-700 text-xs font-extrabold">
                <AlertTriangle className="w-4 h-4" />
                {formatNumber(Object.keys(requiredErrors).length)} required issues remain
              </div>
            )}
          </div>
        </Card>
      </div>

      <Card className="p-6">
        <div className="text-sm font-extrabold text-slate-900">Review Snapshot</div>
        <div className="text-xs text-slate-500 font-semibold mt-1">Summaries of each step (sensitive fields masked by role).</div>
        <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <div className="text-[11px] font-extrabold text-slate-600">Employee</div>
            <div className="text-sm font-extrabold text-slate-900 mt-1">{`${draft.personal.firstName} ${draft.personal.lastName}`.trim() || '—'}</div>
            <div className="text-xs text-slate-500 font-semibold mt-1">{draft.job.jobTitle || '—'}</div>
          </div>
          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <div className="text-[11px] font-extrabold text-slate-600">Contact</div>
            <div className="text-sm font-extrabold text-slate-900 mt-1">{draft.contact.officialEmail || '—'}</div>
            <div className="text-xs text-slate-500 font-semibold mt-1">{draft.contact.primaryPhone || '—'}</div>
          </div>
          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <div className="text-[11px] font-extrabold text-slate-600">Employment</div>
            <div className="text-sm font-extrabold text-slate-900 mt-1">{draft.employment.employmentType || '—'}</div>
            <div className="text-xs text-slate-500 font-semibold mt-1">Joined {draft.employment.dateJoined || '—'}</div>
          </div>
          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <div className="text-[11px] font-extrabold text-slate-600">Documents</div>
            <div className="text-sm font-extrabold text-slate-900 mt-1">{formatNumber(draft.documents.length)}</div>
            <div className="text-xs text-slate-500 font-semibold mt-1">Pending {formatNumber(draft.documents.filter((x) => x.status === 'Pending').length)}</div>
          </div>
          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <div className="text-[11px] font-extrabold text-slate-600">Emergency Contacts</div>
            <div className="text-sm font-extrabold text-slate-900 mt-1">{formatNumber(draft.emergencyContacts.length)}</div>
            <div className="text-xs text-slate-500 font-semibold mt-1">Primary {draft.emergencyContacts.some((x) => x.isPrimary) ? 'Yes' : 'No'}</div>
          </div>
          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <div className="text-[11px] font-extrabold text-slate-600">Payroll</div>
            <div className="text-sm font-extrabold text-slate-900 mt-1">{perms.canViewPayroll ? (draft.payroll.setupAssignedToPayroll ? 'Assigned' : 'Configured') : 'Masked'}</div>
            <div className="text-xs text-slate-500 font-semibold mt-1">{draft.payroll.payrollGroup || '—'}</div>
          </div>
        </div>
      </Card>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <button type="button" onClick={() => saveDraft('draft')} disabled={!perms.canCreate || saving} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-extrabold text-slate-700 hover:bg-slate-50 transition-colors">
          <Save className="w-4 h-4" />
          Save as Draft
        </button>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => saveDraft('submit-approval')}
            disabled={!perms.canSubmitApproval || saving || submitting}
            className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-extrabold transition-colors ${
              perms.canSubmitApproval ? 'bg-dle-blue text-white hover:bg-dle-blue-deep' : 'bg-slate-100 text-slate-400'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            Submit for Approval
          </button>
          <button
            type="button"
            onClick={() => createEmployee(false)}
            disabled={!perms.canCreate || saving || submitting}
            className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-extrabold transition-colors ${perms.canCreate ? 'bg-slate-900 text-white hover:bg-slate-800' : 'bg-slate-100 text-slate-400'}`}
          >
            <CheckCircle2 className="w-4 h-4" />
            Create Employee Immediately
          </button>
          <button
            type="button"
            onClick={() => createEmployee(true)}
            disabled={!perms.canCreate || saving || submitting}
            className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-extrabold transition-colors ${perms.canCreate ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'bg-slate-100 text-slate-400'}`}
          >
            <ClipboardCheck className="w-4 h-4" />
            Create + Start Onboarding
          </button>
        </div>
      </div>
    </div>
  );

  const bodyLeft = (
    <div className="space-y-6 min-w-0">
      <AnimatePresence mode="wait">
        {step === 'personal' && (
          <motion.div key="personal" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.16 }}>
            {personalStep}
          </motion.div>
        )}
        {step === 'contact' && (
          <motion.div key="contact" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.16 }}>
            {contactStep}
          </motion.div>
        )}
        {step === 'employment' && (
          <motion.div key="employment" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.16 }}>
            {employmentStep}
          </motion.div>
        )}
        {step === 'job' && (
          <motion.div key="job" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.16 }}>
            {jobStep}
          </motion.div>
        )}
        {step === 'emergency' && (
          <motion.div key="emergency" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.16 }}>
            {emergencyStep}
          </motion.div>
        )}
        {step === 'documents' && (
          <motion.div key="documents" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.16 }}>
            {documentsStep}
          </motion.div>
        )}
        {step === 'payroll' && (
          <motion.div key="payroll" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.16 }}>
            {payrollStep}
          </motion.div>
        )}
        {step === 'onboarding' && (
          <motion.div key="onboarding" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.16 }}>
            {onboardingStep}
          </motion.div>
        )}
        {step === 'review' && (
          <motion.div key="review" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.16 }}>
            {reviewStep}
          </motion.div>
        )}
      </AnimatePresence>

      <Card className="p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <button type="button" onClick={goPrev} disabled={stepIndex === 0} className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-extrabold transition-colors ${stepIndex === 0 ? 'bg-slate-100 text-slate-400 border-slate-200' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}>
              <ChevronLeft className="w-4 h-4" />
              Previous
            </button>
            <button type="button" onClick={goNext} disabled={stepIndex === STEP_ORDER.length - 1} className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-extrabold transition-colors ${stepIndex === STEP_ORDER.length - 1 ? 'bg-slate-100 text-slate-400 border-slate-200' : 'bg-slate-900 text-white border-slate-900 hover:bg-slate-800'}`}>
              Continue
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button type="button" onClick={() => saveDraft('draft')} disabled={!perms.canCreate || saving} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-extrabold text-slate-700 hover:bg-slate-50 transition-colors">
              <Save className="w-4 h-4" />
              Save as draft
            </button>
            <button type="button" onClick={() => setDraft(makeEmptyDraft(countryDefault))} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-extrabold text-slate-700 hover:bg-slate-50 transition-colors">
              <Trash2 className="w-4 h-4" />
              Reset
            </button>
          </div>
        </div>
      </Card>
    </div>
  );

  const rightPanel = (
    <div className="space-y-6">
      {aiPanel}
      <Card className="p-6">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-extrabold text-slate-900">Quick Controls</div>
          <span className="text-[11px] font-extrabold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700">Wizard</span>
        </div>
        <div className="mt-4 space-y-3">
          <button type="button" onClick={() => saveDraft('draft')} disabled={!perms.canCreate || saving} className={`w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-extrabold transition-colors ${perms.canCreate ? 'bg-dle-blue text-white hover:bg-dle-blue-deep' : 'bg-slate-100 text-slate-400'}`}>
            <Save className="w-4 h-4" />
            Save Draft
          </button>
          <button type="button" onClick={runAI} className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-extrabold text-slate-700 hover:bg-slate-50 transition-colors">
            <Sparkles className="w-4 h-4 text-violet-600" />
            Run AI Checks
          </button>
          <button
            type="button"
            onClick={() => saveDraft('submit-approval')}
            disabled={!perms.canSubmitApproval || saving || submitting}
            className={`w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-extrabold transition-colors ${perms.canSubmitApproval ? 'bg-slate-900 text-white hover:bg-slate-800' : 'bg-slate-100 text-slate-400'}`}
          >
            <ShieldCheck className="w-4 h-4" />
            Submit for Approval
          </button>
          <button
            type="button"
            onClick={() => createEmployee(true)}
            disabled={!perms.canCreate || saving || submitting}
            className={`w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-extrabold transition-colors ${perms.canCreate ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'bg-slate-100 text-slate-400'}`}
          >
            <ClipboardCheck className="w-4 h-4" />
            Create + Start Onboarding
          </button>
        </div>
      </Card>
    </div>
  );

  if (!perms.canCreate && role !== 'Auditor') {
    return (
      <div className="bg-white space-y-6">
        {breadcrumb}
        {header}
        <Card className="p-10 text-center">
          <div className="mx-auto w-12 h-12 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-600">
            <Lock className="w-6 h-6" />
          </div>
          <div className="text-lg font-extrabold text-slate-900 mt-4">Permission denied</div>
          <div className="text-sm text-slate-600 font-semibold mt-1">Only HR/Admin users can add employees. Payroll/Department users can view or support onboarding tasks when assigned.</div>
        </Card>
      </div>
    );
  }

  if (options.status === 'error') {
    return (
      <div className="bg-white space-y-6">
        {breadcrumb}
        {header}
        <Card className="p-10 text-center">
          <div className="mx-auto w-12 h-12 rounded-2xl bg-red-600/10 border border-red-200 flex items-center justify-center text-red-700">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div className="text-lg font-extrabold text-slate-900 mt-4">Unable to load form options</div>
          <div className="text-sm text-slate-600 font-semibold mt-1">{options.error}</div>
        </Card>
      </div>
    );
  }

  return (
    <div className="bg-white space-y-6">
      {breadcrumb}
      {header}
      {progress}

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_420px] gap-6">
        {bodyLeft}
        {rightPanel}
      </div>

      <AnimatePresence>
        {toast && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} transition={{ duration: 0.16 }} className="fixed bottom-6 right-6 z-50">
            <div className={`w-[380px] rounded-2xl border shadow-lg p-4 bg-white ${toast.tone === 'err' ? 'border-red-200' : toast.tone === 'warn' ? 'border-amber-200' : 'border-slate-200'}`}>
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
