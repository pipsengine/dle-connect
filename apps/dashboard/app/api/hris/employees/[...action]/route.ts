import { NextResponse } from 'next/server';
import {
  deleteEmployeeDraftFromDb,
  findEmployeeDuplicatesInDb,
  getEmployeeDraftFromDb,
  importSagePayrollEmployeesToDb,
  listEmployeeDraftsByStatusFromDb,
  previewNextEmployeeCodeFromDb,
  saveEmployeeDraftToDb,
} from '@/lib/dle-enterprise-db';
import { readPayrollEmployees } from '@/lib/payroll-employee-source';
import { readActiveSagePayrollEmployees } from '@/lib/sage-people-payroll-store';

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

type Severity = 'high' | 'medium' | 'low';

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

type ChecklistItem = {
  id: string;
  title: string;
  status: 'Pending' | 'In Progress' | 'Done' | 'Blocked';
  responsibleOfficer: string;
  dueDate: string;
  notes: string;
};

type EmployeeDraftPayload = {
  personal: Record<string, any>;
  contact: Record<string, any>;
  employment: Record<string, any>;
  job: Record<string, any>;
  emergencyContacts: EmergencyContact[];
  documents: DocumentDraft[];
  payroll: Record<string, any>;
  onboardingChecklist: ChecklistItem[];
};

type DraftRecord = {
  draftId: string;
  status: 'draft' | 'submitted' | 'approved' | 'created';
  createdAt: string;
  updatedAt: string;
  draft: EmployeeDraftPayload;
  audit: { id: string; at: string; action: string; performedBy: Role; reason?: string; oldValue?: string; newValue?: string }[];
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
  employees?: Array<{ employeeId: string; fullName: string; department?: string; jobTitle?: string; location?: string; manager?: string }>;
};

const employeeTypePrefix = (employeeType: unknown) => {
  const normalized = typeof employeeType === 'string' ? employeeType.trim().toLowerCase() : '';
  if (normalized === 'permanent') return 'P';
  if (normalized === 'lumpsum') return 'L';
  if (normalized === 'daily rate') return 'C';
  if (normalized === 'nysc' || normalized.includes('nysc')) return 'N';
  if (
    normalized === 'it' ||
    normalized === 'intern' ||
    normalized.includes('industrial trainee') ||
    normalized.includes('industrial training') ||
    normalized.includes('industrial attachment') ||
    normalized.includes('intern')
  ) return 'I';
  return '';
};

const jsonOk = <T,>(data: T) => NextResponse.json({ status: 'success', data });
const jsonErr = (status: number, error: string) => NextResponse.json({ status: 'error', error }, { status });

const nowIso = () => new Date().toISOString();

const getRole = (request: Request): Role => {
  const v = request.headers.get('x-hris-role');
  const all: Role[] = [
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
  ];
  return (all.includes(v as Role) ? (v as Role) : 'HR Officer') as Role;
};

const permissions = (role: Role) => {
  const canCreate =
    role === 'Super Admin' || role === 'HR Director' || role === 'HR Manager' || role === 'HR Officer' || role === 'Admin Officer';
  const canSubmitApproval = role === 'Super Admin' || role === 'HR Director' || role === 'HR Manager' || role === 'HR Officer';
  const canApproveEmployee = role === 'Super Admin' || role === 'HR Director' || role === 'HR Manager';
  const canCreateWithoutApproval = role === 'Super Admin' || role === 'HR Director';
  return { canCreate, canSubmitApproval, canApproveEmployee, canCreateWithoutApproval };
};

const loadDraftRecord = async (draftId: string): Promise<DraftRecord | null> => {
  const rec = storeDrafts.get(draftId) || ((await getEmployeeDraftFromDb(draftId)) as DraftRecord | null);
  if (rec) storeDrafts.set(draftId, rec);
  return rec;
};

const storeDrafts = (() => {
  const g = globalThis as unknown as { __dleHrisEmployeeDrafts?: Map<string, DraftRecord> };
  if (!g.__dleHrisEmployeeDrafts) g.__dleHrisEmployeeDrafts = new Map();
  return g.__dleHrisEmployeeDrafts;
})();

const storeOverrides = (() => {
  const g = globalThis as unknown as { __dleHrisEmployeeOverrides?: Map<string, any> };
  if (!g.__dleHrisEmployeeOverrides) g.__dleHrisEmployeeOverrides = new Map();
  return g.__dleHrisEmployeeOverrides;
})();

const audit = (rec: DraftRecord, role: Role, action: string, extra?: Partial<DraftRecord['audit'][number]>) => {
  rec.audit.unshift({
    id: `audit-${Math.random().toString(16).slice(2)}`,
    at: nowIso(),
    action,
    performedBy: role,
    ...extra,
  });
};

const normalize = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const normalizeLower = (v: unknown) => normalize(v).toLowerCase();

const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
const isPhone = (s: string) => /^[+]?[\d\s()-]{7,20}$/.test(s.trim());
const parseDate = (yyyyMmDd: string) => (/^\d{4}-\d{2}-\d{2}$/.test(yyyyMmDd) ? new Date(`${yyyyMmDd}T00:00:00.000Z`).getTime() : NaN);

const draftIdGen = () => `DRAFT-${Math.random().toString(16).slice(2, 8).toUpperCase()}${Math.random().toString(16).slice(2, 6).toUpperCase()}`;

const nextPreviewFallback = (employeeType: string) => {
  const prefix = employeeTypePrefix(employeeType);
  if (!prefix) return null;
  let latest = 0;
  for (const [employeeId] of storeOverrides.entries()) {
    const m = employeeId.match(new RegExp(`^${prefix}(\\d+)$`, 'i'));
    if (m) latest = Math.max(latest, Number(m[1]));
  }
  for (const d of storeDrafts.values()) {
    const code = normalize(d.draft?.employment?.employeeId);
    const m = code.match(new RegExp(`^${prefix}(\\d+)$`, 'i'));
    if (m) latest = Math.max(latest, Number(m[1]));
  }
  return `${prefix}${String(latest + 1).padStart(4, '0')}`;
};

const validateDraft = (draft: EmployeeDraftPayload): ValidationResult => {
  const errors: ValidationResult['errors'] = [];
  const warnings: ValidationResult['warnings'] = [];
  const missing: string[] = [];

  const p = draft.personal || {};
  const c = draft.contact || {};
  const e = draft.employment || {};
  const j = draft.job || {};

  const req = (path: string, val: string, message = 'Required') => {
    if (!val) {
      errors.push({ path, message, severity: 'high' });
      missing.push(path);
      return false;
    }
    return true;
  };

  req('personal.firstName', normalize(p.firstName));
  req('personal.lastName', normalize(p.lastName));
  req('personal.gender', normalize(p.gender));
  req('personal.dateOfBirth', normalize(p.dateOfBirth));
  if (normalize(p.dateOfBirth)) {
    const dob = parseDate(normalize(p.dateOfBirth));
    if (Number.isFinite(dob)) {
      const age = Math.floor((Date.now() - dob) / (365.25 * 24 * 3600 * 1000));
      if (age < 18) errors.push({ path: 'personal.dateOfBirth', message: 'Employee must meet minimum employment age (18)', severity: 'high' });
    }
  }

  req('contact.residentialAddress', normalize(c.residentialAddress));
  req('contact.country', normalize(c.country));
  if (normalize(c.officialEmail) && !isEmail(normalize(c.officialEmail))) errors.push({ path: 'contact.officialEmail', message: 'Official email must be valid', severity: 'high' });
  if (normalize(c.personalEmail) && !isEmail(normalize(c.personalEmail))) errors.push({ path: 'contact.personalEmail', message: 'Personal email must be valid', severity: 'medium' });
  if (normalize(c.primaryPhone) && !isPhone(normalize(c.primaryPhone))) errors.push({ path: 'contact.primaryPhone', message: 'Phone number must be valid', severity: 'high' });
  if (normalize(c.alternatePhone) && !isPhone(normalize(c.alternatePhone))) warnings.push({ path: 'contact.alternatePhone', message: 'Alternate phone number format may be invalid', severity: 'low' });

  req('employment.employmentType', normalize(e.employmentType));
  if (normalize(e.employmentType) && !['Permanent', 'Lumpsum', 'Daily Rate', 'NYSC', 'IT', 'Intern', 'Industrial Trainee'].includes(normalize(e.employmentType))) {
    errors.push({ path: 'employment.employmentType', message: 'Employee Type must be Permanent, Lumpsum, Daily Rate, NYSC, IT, Intern, or Industrial Trainee', severity: 'high' });
  }
  req('employment.employmentStatus', normalize(e.employmentStatus));
  req('employment.dateJoined', normalize(e.dateJoined));
  if (normalize(e.dateJoined)) {
    const dj = parseDate(normalize(e.dateJoined));
    if (Number.isFinite(dj) && dj > Date.now() && !e.onboardingScheduled) errors.push({ path: 'employment.dateJoined', message: 'Date joined cannot be future date unless onboarding is scheduled', severity: 'high' });
  }
  if (normalize(e.employmentType) === 'Permanent') {
    req('employment.probationStartDate', normalize(e.probationStartDate), 'Required for Permanent');
    req('employment.probationEndDate', normalize(e.probationEndDate), 'Required for Permanent');
    const ps = parseDate(normalize(e.probationStartDate));
    const pe = parseDate(normalize(e.probationEndDate));
    if (Number.isFinite(ps) && Number.isFinite(pe) && pe < ps) errors.push({ path: 'employment.probationEndDate', message: 'Probation end date cannot be before probation start date', severity: 'high' });
  }
  if (normalize(e.employmentType) === 'Lumpsum' || normalize(e.employmentType) === 'Daily Rate') {
    const cs = parseDate(normalize(e.contractStartDate));
    const ce = parseDate(normalize(e.contractEndDate));
    if (Number.isFinite(cs) && Number.isFinite(ce) && ce < cs) errors.push({ path: 'employment.contractEndDate', message: 'Engagement end date cannot be before engagement start date', severity: 'high' });
  }

  req('job.department', normalize(j.department));
  req('job.jobTitle', normalize(j.jobTitle));
  req('job.reportingManager', normalize(j.reportingManager), 'Reporting manager is required unless executive role');
  const fullName = `${normalize(p.firstName)} ${normalize(p.lastName)}`.trim().toLowerCase();
  if (fullName && normalize(j.reportingManager).toLowerCase() === fullName) errors.push({ path: 'job.reportingManager', message: 'Manager cannot be same as employee', severity: 'high' });

  if (!Array.isArray(draft.emergencyContacts) || draft.emergencyContacts.length < 1) {
    errors.push({ path: 'emergencyContacts', message: 'At least one emergency contact is required', severity: 'high' });
    missing.push('emergencyContacts');
  } else {
    if (!draft.emergencyContacts.some((x) => !!x.isPrimary)) errors.push({ path: 'emergencyContacts.primary', message: 'One emergency contact must be primary', severity: 'high' });
    for (const ec of draft.emergencyContacts) {
      if (!normalize(ec.fullName)) errors.push({ path: `emergencyContacts.${ec.id}.fullName`, message: 'Emergency contact full name is required', severity: 'high' });
      if (!normalize(ec.relationship)) errors.push({ path: `emergencyContacts.${ec.id}.relationship`, message: 'Emergency contact relationship is required', severity: 'high' });
      if (!normalize(ec.phoneNumber) || !isPhone(normalize(ec.phoneNumber))) errors.push({ path: `emergencyContacts.${ec.id}.phoneNumber`, message: 'Emergency contact phone number must be valid', severity: 'high' });
    }
  }

  if (!Array.isArray(draft.documents) || draft.documents.length < 1) warnings.push({ path: 'documents', message: 'No documents attached yet', severity: 'low' });
  if ((normalize(e.employmentType) === 'Lumpsum' || normalize(e.employmentType) === 'Daily Rate') && Array.isArray(draft.documents)) {
    const hasAgreement = draft.documents.some((d) => normalizeLower(d.category).includes('contract') || normalizeLower(d.category).includes('agreement'));
    if (!hasAgreement) warnings.push({ path: 'documents.engagementAgreement', message: 'Project-based employees should upload an engagement agreement', severity: 'medium' });
  }

  const requiredTotal = 12;
  const filled = requiredTotal - Math.min(requiredTotal, missing.length + errors.filter((x) => x.severity === 'high').length);
  const completenessPct = Math.max(0, Math.min(100, Math.round((filled / requiredTotal) * 100)));

  return {
    valid: errors.length === 0,
    completenessPct,
    errors,
    warnings,
    missingFields: missing.slice(0, 60),
  };
};

const duplicateCheck = async (payload: any): Promise<DuplicateResult> => {
  const matches: DuplicateResult['matches'] = [];
  const fullName = normalizeLower(payload.fullName);
  const officialEmail = normalizeLower(payload.officialEmail);
  const personalEmail = normalizeLower(payload.personalEmail);
  const primaryPhone = normalize(payload.primaryPhone).replace(/\s+/g, '');
  const dob = normalize(payload.dateOfBirth);

  for (const [employeeId, ov] of storeOverrides.entries()) {
    const p = ov?.profile || {};
    const pi = p?.personalInfo || {};
    const ct = p?.contacts || {};
    const name2 = normalizeLower(p.fullName);
    const email2 = normalizeLower(ct.officialEmail);
    const phone2 = normalize(ct.primaryPhone).replace(/\s+/g, '');
    const dob2 = normalize(pi.dateOfBirth);
    if (officialEmail && email2 && officialEmail === email2) matches.push({ employeeId, reason: 'Same official email' });
    if (primaryPhone && phone2 && primaryPhone === phone2) matches.push({ employeeId, reason: 'Same phone number' });
    if (fullName && name2 && fullName === name2 && dob && dob2 && dob2.includes(dob)) matches.push({ employeeId, reason: 'Same name and date of birth' });
    if (personalEmail && normalizeLower(ct.personalEmail) === personalEmail) matches.push({ employeeId, reason: 'Same personal email' });
  }

  for (const [draftId, d] of storeDrafts.entries()) {
    const c = d.draft?.contact || {};
    const p = d.draft?.personal || {};
    const name2 = `${normalizeLower(p.firstName)} ${normalizeLower(p.lastName)}`.trim();
    const email2 = normalizeLower(c.officialEmail);
    const phone2 = normalize(c.primaryPhone).replace(/\s+/g, '');
    if (officialEmail && email2 && officialEmail === email2) matches.push({ draftId, reason: 'Draft with same official email' });
    if (primaryPhone && phone2 && primaryPhone === phone2) matches.push({ draftId, reason: 'Draft with same phone number' });
    if (fullName && name2 && fullName === name2 && dob && normalize(p.dateOfBirth) === dob) matches.push({ draftId, reason: 'Draft with same name and date of birth' });
  }

  matches.push(...(await findEmployeeDuplicatesInDb(payload)));

  const unique = new Map<string, { employeeId?: string; draftId?: string; reason: string }>();
  for (const m of matches) unique.set(`${m.employeeId || ''}:${m.draftId || ''}:${m.reason}`, m);
  const uniq = Array.from(unique.values());
  const confidence = uniq.length === 0 ? 0.12 : Math.min(0.95, 0.5 + uniq.length * 0.15);

  return { status: uniq.length > 0 ? 'potential-duplicate' : 'ok', matches: uniq.slice(0, 12), confidence };
};

const templateChecklist = (): ChecklistItem[] => [
  { id: 'chk-1', title: 'HR profile completed', status: 'Pending', responsibleOfficer: 'HR Officer', dueDate: '', notes: '' },
  { id: 'chk-2', title: 'Employment letter issued', status: 'Pending', responsibleOfficer: 'HR Officer', dueDate: '', notes: '' },
  { id: 'chk-3', title: 'Documents verified', status: 'Pending', responsibleOfficer: 'Compliance Officer', dueDate: '', notes: '' },
  { id: 'chk-4', title: 'Payroll setup completed', status: 'Pending', responsibleOfficer: 'Payroll Officer', dueDate: '', notes: '' },
  { id: 'chk-5', title: 'Email account requested', status: 'Pending', responsibleOfficer: 'IT Administrator', dueDate: '', notes: '' },
  { id: 'chk-6', title: 'Laptop requested', status: 'Pending', responsibleOfficer: 'IT Administrator', dueDate: '', notes: '' },
  { id: 'chk-7', title: 'Access card requested', status: 'Pending', responsibleOfficer: 'Admin Officer', dueDate: '', notes: '' },
  { id: 'chk-8', title: 'PPE requested', status: 'Pending', responsibleOfficer: 'HSE Officer', dueDate: '', notes: '' },
  { id: 'chk-9', title: 'Department induction scheduled', status: 'Pending', responsibleOfficer: 'Department Head', dueDate: '', notes: '' },
  { id: 'chk-10', title: 'HSE induction scheduled', status: 'Pending', responsibleOfficer: 'HSE Officer', dueDate: '', notes: '' },
  { id: 'chk-11', title: 'IT onboarding scheduled', status: 'Pending', responsibleOfficer: 'IT Administrator', dueDate: '', notes: '' },
  { id: 'chk-12', title: 'Line manager assigned', status: 'Pending', responsibleOfficer: 'HR Officer', dueDate: '', notes: '' },
  { id: 'chk-13', title: 'Probation tracker created', status: 'Pending', responsibleOfficer: 'HR Officer', dueDate: '', notes: '' },
  { id: 'chk-14', title: 'Leave entitlement initialized', status: 'Pending', responsibleOfficer: 'HR Officer', dueDate: '', notes: '' },
];

const fallbackOptionsPayload = (): FormOptions => ({
  departments: [
    'Civil Engineering',
    'Mechanical Engineering',
    'Electrical & Instrumentation',
    'Project Controls',
    'HSE',
    'Quality Assurance',
    'Procurement',
    'Finance',
    'Human Capital',
    'IT & Support',
    'Legal & Compliance',
    'Executive Office',
  ],
  divisions: ['Engineering', 'Operations', 'Corporate Services', 'Projects', 'Commercial'],
  businessUnits: ['DLE Projects', 'DLE Fabrication', 'DLE Marine', 'DLE Corporate', 'DLE Energy'],
  locations: ['Lagos HQ', 'Port Harcourt Office', 'Warri Yard', 'Abuja Office', 'Onne Site', 'Kaduna Site', 'Offshore Platform'],
  jobTitles: [
    'Senior Civil Engineer',
    'Mechanical Supervisor',
    'E&I Technician',
    'Project Manager',
    'Planning Engineer',
    'Quantity Surveyor',
    'HSE Officer',
    'QA/QC Engineer',
    'HR Officer',
    'Payroll Specialist',
    'IT Support Engineer',
    'Legal Counsel',
    'Executive Assistant',
  ],
  jobGrades: ['G7', 'G8', 'G9', 'G10', 'G11', 'G12'],
  costCenters: ['CC-ENG-001', 'CC-OPS-004', 'CC-HR-002', 'CC-FIN-003', 'CC-IT-005'],
  projectSites: ['Lekki Project', 'NLNG Train 7', 'Bonny Island', 'Onshore Pipeline', 'Bridgeworks', 'Fabrication Bay', 'N/A'],
  payrollGroups: ['Monthly', 'Bi-Weekly', 'Project-Based'],
  salaryGrades: ['SG-07', 'SG-08', 'SG-09', 'SG-10', 'SG-11'],
  banks: ['GTBank', 'Access Bank', 'Zenith Bank', 'FirstBank', 'UBA'],
  pensionProviders: ['ARM Pensions', 'Stanbic IBTC', 'Leadway Pensure', 'PENCOM'],
  benefitGroups: ['Standard', 'Executive', 'Project', 'Contractor'],
  workModes: ['Onsite', 'Hybrid', 'Remote'],
  shiftPatterns: ['Day', 'Night', 'Rotational'],
  staffCategories: ['Senior Staff', 'Junior Staff', 'Contractor'],
  employeeCategories: ['Operations', 'Corporate Services', 'Projects', 'Commercial'],
  roleProfiles: ['HR Generalist', 'Project Delivery', 'Finance Ops', 'HSE Compliance', 'IT Support'],
});

const uniqueSorted = (values: unknown[]) =>
  Array.from(new Set(values.map((value) => (typeof value === 'string' ? value.trim() : '')).filter(Boolean))).sort((a, b) => a.localeCompare(b));

const mergeUnique = (primary: string[], fallback: string[]) => uniqueSorted([...primary, ...fallback]);

const optionsPayload = async (includeEmployees = false): Promise<FormOptions> => {
  const fallback = fallbackOptionsPayload();
  try {
    const employeeSource = await readPayrollEmployees();
    const employees = employeeSource.employees;
    if (!employees.length) return fallback;
    const fromDb = {
      departments: uniqueSorted(employees.map((employee: any) => employee.department)),
      divisions: uniqueSorted(employees.map((employee: any) => employee.division)),
      businessUnits: uniqueSorted(employees.map((employee: any) => employee.businessUnit)),
      locations: uniqueSorted(employees.flatMap((employee: any) => [employee.location, employee.workLocation, employee.officeLocation, employee.projectSite])),
      jobTitles: uniqueSorted(employees.flatMap((employee: any) => [employee.jobTitle, employee.designation])),
      jobGrades: uniqueSorted(employees.map((employee: any) => employee.jobGrade)),
      costCenters: uniqueSorted(employees.map((employee: any) => employee.costCenter)),
      projectSites: uniqueSorted(employees.map((employee: any) => employee.projectSite)),
      staffCategories: uniqueSorted(employees.map((employee: any) => employee.staffCategory)),
      employeeCategories: uniqueSorted(employees.map((employee: any) => employee.employeeCategory)),
    };
    return {
      ...fallback,
      departments: mergeUnique(fromDb.departments, fallback.departments),
      divisions: mergeUnique(fromDb.divisions, fallback.divisions),
      businessUnits: mergeUnique(fromDb.businessUnits, fallback.businessUnits),
      locations: mergeUnique(fromDb.locations, fallback.locations),
      jobTitles: mergeUnique(fromDb.jobTitles, fallback.jobTitles),
      jobGrades: mergeUnique(fromDb.jobGrades, fallback.jobGrades),
      costCenters: mergeUnique(fromDb.costCenters, fallback.costCenters),
      projectSites: mergeUnique(fromDb.projectSites, fallback.projectSites),
      staffCategories: mergeUnique(fromDb.staffCategories, fallback.staffCategories),
      employeeCategories: mergeUnique(fromDb.employeeCategories, fallback.employeeCategories),
      employees: includeEmployees
        ? employees.map((employee: any) => ({
            employeeId: String(employee.employeeId || employee.employeeCode || '').trim(),
            fullName: String(employee.fullName || '').trim(),
            department: String(employee.department || '').trim(),
            jobTitle: String(employee.jobTitle || employee.designation || '').trim(),
            location: String(employee.location || employee.workLocation || '').trim(),
            manager: String(employee.managerName || employee.manager || '').trim(),
          })).filter((employee) => employee.employeeId && employee.fullName)
        : undefined,
    };
  } catch {
    return fallback;
  }
};

const validateDoc = (d: any) => {
  const mime = normalize(d.mimeType);
  const size = typeof d.sizeBytes === 'number' ? d.sizeBytes : 0;
  const allowed = ['application/pdf', 'image/jpeg', 'image/png'];
  if (!allowed.includes(mime)) return 'File type not allowed';
  if (size > 15 * 1024 * 1024) return 'File size limit exceeded';
  return null;
};

export async function GET(request: Request, ctx: { params: Promise<{ action: string[] }> }) {
  const role = getRole(request);
  const perms = permissions(role);
  const { action } = await ctx.params;
  const seg0 = action[0] || '';

  if (seg0 === 'form-options') {
    const includeEmployees = new URL(request.url).searchParams.get('includeEmployees') === '1';
    return jsonOk(await optionsPayload(includeEmployees));
  }
  if (seg0 === 'onboarding' && action[1] === 'checklist-template') return jsonOk(templateChecklist());
  if (seg0 === 'employee-code' && action[1] === 'next') {
    const employeeType = new URL(request.url).searchParams.get('employeeType') || '';
    const prefix = employeeTypePrefix(employeeType);
    if (!prefix) return jsonErr(400, 'employeeType must be Permanent, Lumpsum, Daily Rate, NYSC, IT, Intern, or Industrial Trainee');
    const employeeCode = (await previewNextEmployeeCodeFromDb(employeeType)) || nextPreviewFallback(employeeType);
    return jsonOk({ employeeCode, prefix, employeeType });
  }
  if (seg0 === 'pending-approvals') {
    if (!perms.canApproveEmployee) return jsonErr(403, 'Permission denied');
    const memoryDrafts = [...storeDrafts.values()].filter((rec) => rec.status === 'submitted');
    const dbDrafts = await listEmployeeDraftsByStatusFromDb(['submitted']);
    const merged = new Map<string, DraftRecord>();
    for (const rec of [...dbDrafts, ...memoryDrafts] as DraftRecord[]) merged.set(rec.draftId, rec);
    return jsonOk({
      drafts: [...merged.values()].map((rec) => ({
        draftId: rec.draftId,
        status: rec.status,
        updatedAt: rec.updatedAt,
        fullName: `${rec.draft.personal?.firstName || ''} ${rec.draft.personal?.lastName || ''}`.trim(),
        department: rec.draft.job?.department || '—',
        jobTitle: rec.draft.job?.jobTitle || '—',
        reportingManager: rec.draft.job?.reportingManager || '—',
        employmentType: rec.draft.employment?.employmentType || '—',
      })),
    });
  }
  if (seg0 === 'draft' && action[1]) {
    const draftId = action[1];
    const rec = await loadDraftRecord(draftId);
    if (!rec) return jsonErr(404, 'Draft not found');
    return jsonOk({ draft: rec.draft, meta: { draftId: rec.draftId, status: rec.status, updatedAt: rec.updatedAt } });
  }

  return jsonErr(404, 'Not found');
}

export async function POST(request: Request, ctx: { params: Promise<{ action: string[] }> }) {
  const role = getRole(request);
  const perms = permissions(role);
  const { action } = await ctx.params;
  const seg0 = action[0] || '';
  const body = (await request.json().catch(() => null)) as any;

  if (seg0 === 'draft') {
    if (!perms.canCreate) return jsonErr(403, 'Permission denied');
    if (!body || typeof body !== 'object') return jsonErr(400, 'Invalid JSON body');
    const draft: EmployeeDraftPayload = body.draft;
    if (!draft || typeof draft !== 'object') return jsonErr(400, 'draft is required');
    const draftId = draftIdGen();
    const rec: DraftRecord = {
      draftId,
      status: 'draft',
      createdAt: nowIso(),
      updatedAt: nowIso(),
      draft,
      audit: [],
    };
    audit(rec, role, 'Draft created');
    storeDrafts.set(draftId, rec);
    await saveEmployeeDraftToDb(rec);
    return jsonOk({ draftId, status: rec.status, updatedAt: rec.updatedAt });
  }

  if (seg0 === 'validate') {
    if (!body || typeof body !== 'object') return jsonErr(400, 'Invalid JSON body');
    const draft: EmployeeDraftPayload = body.draft;
    if (!draft || typeof draft !== 'object') return jsonErr(400, 'draft is required');
    return jsonOk(validateDraft(draft));
  }

  if (seg0 === 'duplicate-check') {
    if (!body || typeof body !== 'object') return jsonErr(400, 'Invalid JSON body');
    return jsonOk(await duplicateCheck(body));
  }

  if (seg0 === 'documents' && action[1] === 'upload') {
    if (!perms.canCreate) return jsonErr(403, 'Permission denied');
    const draftId = normalize(body?.draftId);
    const docs = Array.isArray(body?.documents) ? body.documents : null;
    if (!draftId) return jsonErr(400, 'draftId is required');
    if (!docs) return jsonErr(400, 'documents is required');
    const rec = await loadDraftRecord(draftId);
    if (!rec) return jsonErr(404, 'Draft not found');
    let uploaded = 0;
    const nextDocs = [...(rec.draft.documents || [])];
    for (const d of docs) {
      const err = validateDoc(d);
      if (err) return jsonErr(400, err);
      const id = normalize(d.id) || `doc-${Math.random().toString(16).slice(2)}`;
      const item: DocumentDraft = {
        id,
        category: normalize(d.category) || 'Document',
        fileName: normalize(d.fileName) || 'file',
        mimeType: normalize(d.mimeType) || 'application/octet-stream',
        sizeBytes: typeof d.sizeBytes === 'number' ? d.sizeBytes : 0,
        expiresAt: normalize(d.expiresAt),
        status: 'Uploaded',
      };
      const idx = nextDocs.findIndex((x) => x.id === id);
      if (idx >= 0) nextDocs[idx] = item;
      else nextDocs.unshift(item);
      uploaded++;
    }
    rec.draft.documents = nextDocs;
    rec.updatedAt = nowIso();
    audit(rec, role, 'Document uploaded');
    await saveEmployeeDraftToDb(rec);
    return jsonOk({ uploaded });
  }

  if (seg0 === 'submit-approval') {
    if (!perms.canSubmitApproval) return jsonErr(403, 'Permission denied');
    const draftId = normalize(body?.draftId);
    if (!draftId) return jsonErr(400, 'draftId is required');
    const rec = await loadDraftRecord(draftId);
    if (!rec) return jsonErr(404, 'Draft not found');
    const v = validateDraft(rec.draft);
    if (!v.valid) return jsonErr(400, 'Validation failed');
    rec.status = 'submitted';
    rec.updatedAt = nowIso();
    audit(rec, role, 'Employee submitted for approval');
    await saveEmployeeDraftToDb(rec);
    return jsonOk({ draftId: rec.draftId, status: 'submitted' });
  }

  if (seg0 === 'approve') {
    if (!perms.canApproveEmployee) return jsonErr(403, 'Permission denied');
    const draftId = normalize(body?.draftId);
    if (!draftId) return jsonErr(400, 'draftId is required');
    const rec = await loadDraftRecord(draftId);
    if (!rec) return jsonErr(404, 'Draft not found');
    if (rec.status !== 'submitted') return jsonErr(400, 'Only submitted drafts can be approved');
    rec.status = 'approved';
    rec.updatedAt = nowIso();
    audit(rec, role, 'Employee draft approved', { reason: normalize(body?.reason) || undefined });
    await saveEmployeeDraftToDb(rec);
    return jsonOk({ draftId: rec.draftId, status: 'approved' });
  }

  if (seg0 === 'reject') {
    if (!perms.canApproveEmployee) return jsonErr(403, 'Permission denied');
    const draftId = normalize(body?.draftId);
    const reason = normalize(body?.reason);
    if (!draftId) return jsonErr(400, 'draftId is required');
    if (!reason) return jsonErr(400, 'reason is required');
    const rec = await loadDraftRecord(draftId);
    if (!rec) return jsonErr(404, 'Draft not found');
    if (rec.status !== 'submitted') return jsonErr(400, 'Only submitted drafts can be rejected');
    rec.status = 'draft';
    rec.updatedAt = nowIso();
    audit(rec, role, 'Employee draft rejected', { reason });
    await saveEmployeeDraftToDb(rec);
    return jsonOk({ draftId: rec.draftId, status: 'draft' });
  }

  if (seg0 === 'onboarding' && action[1] === 'start') {
    if (!perms.canCreate) return jsonErr(403, 'Permission denied');
    const employeeId = normalize(body?.employeeId);
    const draftId = normalize(body?.draftId);
    if (!employeeId && !draftId) return jsonErr(400, 'employeeId or draftId is required');
    if (draftId) {
      const rec = await loadDraftRecord(draftId);
      if (rec) {
        audit(rec, role, 'Onboarding started');
        rec.updatedAt = nowIso();
      }
    }
    return jsonOk({ started: true });
  }

  if (seg0 === 'form-options') {
    const includeEmployees = new URL(request.url).searchParams.get('includeEmployees') === '1';
    return jsonOk(await optionsPayload(includeEmployees));
  }

  if (seg0 === 'import-sage') {
    if (!(role === 'Super Admin' || role === 'HR Director' || role === 'HR Manager')) return jsonErr(403, 'Permission denied');
    const employees = await readActiveSagePayrollEmployees();
    const result = await importSagePayrollEmployeesToDb(employees);
    if (!result) return jsonErr(503, 'DLE_Enterprise HRIS database is not available');
    if (result.failed > 0) return NextResponse.json({ status: 'partial', data: result }, { status: 207 });
    return jsonOk(result);
  }

  if (seg0 === 'employees') return jsonErr(404, 'Not found');

  return jsonErr(404, 'Not found');
}

export async function PATCH(request: Request, ctx: { params: Promise<{ action: string[] }> }) {
  const role = getRole(request);
  const perms = permissions(role);
  const { action } = await ctx.params;
  const seg0 = action[0] || '';
  const draftId = action[1] || '';
  if (seg0 !== 'draft' || !draftId) return jsonErr(404, 'Not found');
  if (!perms.canCreate) return jsonErr(403, 'Permission denied');
  const body = (await request.json().catch(() => null)) as any;
  if (!body || typeof body !== 'object') return jsonErr(400, 'Invalid JSON body');
  const draft: EmployeeDraftPayload = body.draft;
  if (!draft || typeof draft !== 'object') return jsonErr(400, 'draft is required');
  const rec = await loadDraftRecord(draftId);
  if (!rec) return jsonErr(404, 'Draft not found');
  const prev = rec.updatedAt;
  rec.draft = draft;
  rec.updatedAt = nowIso();
  audit(rec, role, 'Draft updated', { oldValue: prev, newValue: rec.updatedAt });
  await saveEmployeeDraftToDb(rec);
  return jsonOk({ draftId: rec.draftId, status: rec.status, updatedAt: rec.updatedAt });
}

export async function DELETE(request: Request, ctx: { params: Promise<{ action: string[] }> }) {
  const role = getRole(request);
  const perms = permissions(role);
  const { action } = await ctx.params;
  const seg0 = action[0] || '';
  const draftId = action[1] || '';
  if (seg0 !== 'draft' || !draftId) return jsonErr(404, 'Not found');
  if (!perms.canCreate) return jsonErr(403, 'Permission denied');
  const rec = await loadDraftRecord(draftId);
  if (!rec) return jsonErr(404, 'Draft not found');
  storeDrafts.delete(draftId);
  await deleteEmployeeDraftFromDb(draftId);
  return jsonOk({ deleted: true });
}
