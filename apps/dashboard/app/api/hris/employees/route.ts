import { NextResponse } from 'next/server';
import {
  createEmployeeFromDraftInDb,
  getEmployeeDraftFromDb,
  nextEmployeeCodeFromDb,
  saveEmployeeDraftToDb,
} from '@/lib/dle-enterprise-db';
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

type EmploymentType =
  | 'Permanent'
  | 'Lumpsum'
  | 'Daily Rate'
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

type DirectoryEmployee = {
  id: string;
  employeeId: string;
  fullName: string;
  preferredName?: string;
  email: string;
  phone: string;
  jobTitle: string;
  department: string;
  division: string;
  businessUnit: string;
  managerName?: string;
  location: string;
  projectSite?: string;
  shift?: 'Day' | 'Night' | 'Rotational';
  employmentType: string;
  status: string;
  nationality: string;
  expatriate: boolean;
  fieldWorker: boolean;
  remoteWorker: boolean;
  dateJoined: string;
  yearsOfService: number;
  lastPromotion?: string;
  aiRiskScore: number;
  trainingCompliance: 'Compliant' | 'Overdue' | 'At Risk';
  performanceRating?: 'A' | 'B' | 'C' | 'D';
  contractEndDate?: string;
  emergencyContactsComplete: boolean;
  hasManagerAssigned: boolean;
  payrollSource: 'Sage 300 People';
  sageEmployeeId: number;
  sageEmployeeCode: string;
  sageEntityCode: string;
  sageCompanyCode: string;
  sageCompanyName: string;
  sageStatusCode: string;
  sageStatusName: string;
  sageRawEmployeeCode: string;
  sageJobGrade: string;
  sageDepartmentCode: string;
  sageSiteCode: string;
  sageEmployeeTypeCode: string;
  sageEmployeeTypeName: string;
  sageManagerEmployeeCode: string;
};

type EmployeeDraftPayload = {
  personal: Record<string, any>;
  contact: Record<string, any>;
  employment: Record<string, any>;
  job: Record<string, any>;
  emergencyContacts: any[];
  documents: any[];
  payroll: Record<string, any>;
  onboardingChecklist: any[];
};

type DraftRecord = {
  draftId: string;
  status: 'draft' | 'submitted' | 'approved' | 'created';
  createdAt: string;
  updatedAt: string;
  draft: EmployeeDraftPayload;
  audit: { id: string; at: string; action: string; performedBy: Role; reason?: string }[];
};

const jsonOk = <T,>(data: T) => NextResponse.json({ status: 'success', data });
const jsonErr = (status: number, error: string) => NextResponse.json({ status: 'error', error }, { status });

const clean = (value: unknown, fallback = '') => {
  if (value === null || value === undefined) return fallback;
  const str = String(value).trim();
  return str || fallback;
};

const isoDate = (value: unknown) => {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
};

const yearsSince = (value: unknown) => {
  const date = value instanceof Date ? value : value ? new Date(String(value)) : null;
  if (!date || Number.isNaN(date.getTime())) return 0;
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / (365.25 * 24 * 3600 * 1000)));
};

const employmentTypeFromCode = (code: string) => {
  const upper = code.trim().toUpperCase();
  if (upper.startsWith('C') || upper.startsWith('L')) return 'Contract';
  return 'Permanent';
};

const cleanHierarchyDisplay = (value: unknown, fallback = '') => {
  const str = clean(value, fallback);
  return str.replace(/^[A-Z0-9_]+\s+-\s+/i, '').trim() || fallback;
};

const cleanNamePart = (value: unknown) => clean(value).replace(/\s+/g, ' ');

const sageFullName = (employee: Awaited<ReturnType<typeof readActiveSagePayrollEmployees>>[number], fallback: string) => {
  const firstNames = cleanNamePart(employee.firstNames);
  const lastName = cleanNamePart(employee.lastName);
  return [firstNames, lastName].filter(Boolean).join(' ') || clean(employee.displayName, fallback);
};

const normalizeStatus = (statusName: string, statusCode: string) => {
  if (statusName.toLowerCase() === 'active' || statusCode.toUpperCase() === 'A') return 'Active';
  return statusName || 'Active';
};

const toDirectoryEmployee = (employee: Awaited<ReturnType<typeof readActiveSagePayrollEmployees>>[number]): DirectoryEmployee => {
  const rawEmployeeCode = clean(employee.employeeCode, String(employee.employeeId));
  const employeeCode = clean(employee.directoryEmployeeCode, rawEmployeeCode);
  const companyName = clean(employee.companyName, 'Sage Payroll');
  const companyCode = clean(employee.companyCode, companyName);
  const statusName = clean(employee.statusName, 'Active');
  const statusCode = clean(employee.statusCode);
  const employmentType = employmentTypeFromCode(employeeCode);
  const department = cleanHierarchyDisplay(
    employee.departmentName || employee.hierarchyDepartmentName,
    'Unassigned Department',
  );
  const location = cleanHierarchyDisplay(
    employee.siteName || employee.hierarchyLocationName,
    clean(employee.departmentName, companyName),
  );
  const jobTitle = clean(employee.jobTitle, 'Unassigned Job Title');
  const managerName = clean(employee.managerName).replace(/^[A-Z0-9_]+\s+-\s+/i, '');
  const nationality = clean(employee.nationality, 'Not recorded');
  const isContract = employmentType === 'Contract';

  return {
    id: employeeCode,
    employeeId: employeeCode,
    fullName: sageFullName(employee, employeeCode),
    email: clean(employee.emailAddress),
    phone: clean(employee.cellNo || employee.workTelNo),
    jobTitle,
    department,
    division: clean(employee.departmentCode, department),
    businessUnit: companyCode,
    managerName: managerName || undefined,
    location,
    projectSite: clean(employee.siteCode) || undefined,
    employmentType,
    status: normalizeStatus(statusName, statusCode),
    nationality,
    expatriate: nationality.toLowerCase() !== 'nigerian' && nationality !== 'Not recorded',
    fieldWorker: isContract || !['IDI_ORO', 'CORPORATE OFFICE'].includes(location.toUpperCase()),
    remoteWorker: false,
    dateJoined: isoDate(employee.dateEngaged || employee.dateJoinedGroup),
    yearsOfService: yearsSince(employee.dateEngaged || employee.dateJoinedGroup),
    aiRiskScore: 0,
    trainingCompliance: 'Compliant',
    contractEndDate: isContract ? isoDate(employee.contractExpiryDate) || undefined : undefined,
    emergencyContactsComplete: true,
    hasManagerAssigned: Boolean(managerName),
    payrollSource: 'Sage 300 People',
    sageEmployeeId: employee.employeeId,
    sageEmployeeCode: employeeCode,
    sageEntityCode: clean(employee.entityCode),
    sageCompanyCode: companyCode,
    sageCompanyName: companyName,
    sageStatusCode: statusCode,
    sageStatusName: statusName,
    sageRawEmployeeCode: rawEmployeeCode,
    sageJobGrade: clean(employee.jobGrade),
    sageDepartmentCode: clean(employee.departmentCode || employee.hierarchyDepartmentCode),
    sageSiteCode: clean(employee.siteCode || employee.hierarchyLocationCode),
    sageEmployeeTypeCode: clean(employee.hierarchyEmployeeTypeCode),
    sageEmployeeTypeName: cleanHierarchyDisplay(employee.hierarchyEmployeeTypeName),
    sageManagerEmployeeCode: clean(employee.managerEmployeeCode),
  };
};

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
  return { canCreate };
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

const nowIso = () => new Date().toISOString();

const nextSeq = () => {
  const g = globalThis as unknown as { __dleHrisEmployeeSeq?: number };
  if (!g.__dleHrisEmployeeSeq) g.__dleHrisEmployeeSeq = 1;
  const cur = g.__dleHrisEmployeeSeq;
  g.__dleHrisEmployeeSeq = cur + 1;
  return cur;
};

const normalizeEmployeeId = (v: unknown) => {
  if (typeof v !== 'string') return '';
  return v.trim().toUpperCase();
};

const employeeTypePrefix = (employeeType: unknown) => {
  const normalized = typeof employeeType === 'string' ? employeeType.trim().toLowerCase() : '';
  if (normalized === 'permanent') return 'P';
  if (normalized === 'lumpsum') return 'L';
  if (normalized === 'daily rate') return 'C';
  return '';
};

const isUniqueEmployeeId = (employeeId: string) => {
  if (!employeeId) return true;
  if (storeOverrides.has(employeeId)) return false;
  for (const d of storeDrafts.values()) {
    const e = normalizeEmployeeId(d.draft?.employment?.employeeId);
    if (e && e === employeeId) return false;
  }
  return true;
};

const finalizeEmployeeId = async (draft: EmployeeDraftPayload) => {
  const employeeType = draft.employment?.employmentType;
  const prefix = employeeTypePrefix(employeeType);
  if (!prefix) throw new Error('Employee Type must be Permanent, Lumpsum, or Daily Rate');
  const dbEmployeeCode = await nextEmployeeCodeFromDb(employeeType);
  if (dbEmployeeCode) return dbEmployeeCode;
  for (let i = 0; i < 1000; i++) {
    const n = nextSeq();
    const gen = `${prefix}${String(n).padStart(4, '0')}`;
    if (isUniqueEmployeeId(gen)) return gen;
  }
  throw new Error('Unable to allocate employee ID');
};

const toProfileOverride = (employeeId: string, draft: EmployeeDraftPayload) => {
  const fullName = `${draft.personal?.firstName || ''} ${draft.personal?.lastName || ''}`.trim() || employeeId;
  const employmentType = (draft.employment?.employmentType as EmploymentType) || 'Permanent';
  const employmentStatus = (draft.employment?.employmentStatus as EmploymentStatus) || 'Active';
  const dateJoined = draft.employment?.dateJoined ? `${draft.employment.dateJoined}T00:00:00.000Z` : nowIso();
  const personalInfo: Record<string, string | null> = {
    title: draft.personal?.title || null,
    firstName: draft.personal?.firstName || null,
    middleName: draft.personal?.middleName || null,
    lastName: draft.personal?.lastName || null,
    preferredName: draft.personal?.preferredName || null,
    gender: draft.personal?.gender || null,
    dateOfBirth: draft.personal?.dateOfBirth ? `${draft.personal.dateOfBirth}T00:00:00.000Z` : null,
    maritalStatus: draft.personal?.maritalStatus || null,
    nationality: draft.personal?.nationality || null,
    stateOfOrigin: draft.personal?.stateOfOrigin || null,
    localGovernmentArea: draft.personal?.localGovernmentArea || null,
    religion: draft.personal?.religion || null,
    languagesSpoken: draft.personal?.languagesSpoken || null,
    personalEmail: draft.contact?.personalEmail || null,
    personalPhone: draft.contact?.primaryPhone || null,
    residentialAddress: draft.contact?.residentialAddress || null,
    permanentAddress: draft.contact?.permanentAddress || null,
  };
  const employmentDetails: Record<string, string | null> = {
    employeeId,
    employmentType,
    employmentStatus,
    dateJoined: draft.employment?.dateJoined || null,
    confirmationDate: draft.employment?.confirmationDueDate || null,
    probationStartDate: draft.employment?.probationStartDate || null,
    probationEndDate: draft.employment?.probationEndDate || null,
    contractStartDate: draft.employment?.contractStartDate || null,
    contractEndDate: draft.employment?.contractEndDate || null,
    exitDate: null,
    exitReason: null,
    rehireEligibility: null,
    workLocation: draft.employment?.workLocation || null,
    workMode: draft.employment?.workMode || null,
    shiftPattern: draft.employment?.shiftPattern || null,
    staffCategory: draft.employment?.staffCategory || null,
    employeeCategory: draft.employment?.employeeCategory || null,
    unionStatus: draft.employment?.unionStatus || null,
  };
  const jobDetails: Record<string, string | null> = {
    jobTitle: draft.job?.jobTitle || null,
    designation: draft.job?.designation || null,
    jobGrade: draft.job?.jobGrade || null,
    department: draft.job?.department || null,
    division: draft.job?.division || null,
    businessUnit: draft.job?.businessUnit || null,
    costCenter: draft.job?.costCenter || null,
    projectSite: draft.job?.projectSite || null,
    reportingManager: draft.job?.reportingManager || null,
    functionalManager: draft.job?.functionalManager || null,
    departmentHead: draft.job?.departmentHead || null,
    hrBusinessPartner: draft.job?.hrBusinessPartner || null,
    roleProfile: draft.job?.roleProfile || null,
    jobDescription: draft.job?.jobDescription || null,
    keyResponsibilities: draft.job?.keyResponsibilities || null,
  };
  const contacts: Record<string, string | null> = {
    officialEmail: draft.contact?.officialEmail || null,
    personalEmail: draft.contact?.personalEmail || null,
    officeExtension: draft.contact?.officeExtension || null,
    primaryPhone: draft.contact?.primaryPhone || null,
    alternativePhone: draft.contact?.alternatePhone || null,
    nearestBusStop: draft.contact?.nearestBusStop || null,
    city: draft.contact?.city || null,
    state: draft.contact?.state || null,
    country: draft.contact?.country || null,
    postalCode: draft.contact?.postalCode || null,
  };
  return {
    profile: {
      employeeId,
      fullName,
      jobTitle: draft.job?.jobTitle || '—',
      department: draft.job?.department || '—',
      businessUnit: draft.job?.businessUnit || '—',
      location: draft.job?.officeLocation || draft.employment?.workLocation || '—',
      employmentStatus,
      employmentType,
      reportingManager: draft.job?.reportingManager || '—',
      dateJoined,
      personalInfo,
      employmentDetails,
      jobDetails,
      contacts,
    },
    emergencyContacts: draft.emergencyContacts || [],
    documents: (draft.documents || []).map((d: any) => ({
      id: d.id || `doc-${Math.random().toString(16).slice(2)}`,
      category: d.category || 'Document',
      fileName: d.fileName || 'file',
      mimeType: d.mimeType || 'application/octet-stream',
      sizeBytes: typeof d.sizeBytes === 'number' ? d.sizeBytes : 0,
      status: 'Uploaded',
      uploadedAt: nowIso(),
      expiresAt: d.expiresAt ? `${d.expiresAt}T00:00:00.000Z` : null,
      verifiedBy: null,
    })),
    payroll: draft.payroll || {},
    onboardingChecklist: draft.onboardingChecklist || [],
  };
};

export async function POST(request: Request) {
  const role = getRole(request);
  if (!permissions(role).canCreate) return jsonErr(403, 'Permission denied');
  const body = (await request.json().catch(() => null)) as any;
  if (!body || typeof body !== 'object') return jsonErr(400, 'Invalid JSON body');
  const draftId = typeof body.draftId === 'string' ? body.draftId.trim() : '';
  const mode = typeof body.mode === 'string' ? body.mode : 'create';
  if (!draftId) return jsonErr(400, 'draftId is required');
  const draftRec = storeDrafts.get(draftId) || ((await getEmployeeDraftFromDb(draftId)) as DraftRecord | null);
  if (!draftRec) return jsonErr(404, 'Draft not found');
  storeDrafts.set(draftId, draftRec);
  if (draftRec.status === 'created') return jsonErr(400, 'Draft already created');

  let employeeId = '';
  try {
    employeeId = await finalizeEmployeeId(draftRec.draft);
  } catch (error) {
    return jsonErr(409, error instanceof Error ? error.message : 'Unable to allocate employee code');
  }
  draftRec.draft.employment.employeeId = employeeId;
  const override = toProfileOverride(employeeId, draftRec.draft);
  const startOnboarding = mode === 'create-and-start-onboarding';
  try {
    await createEmployeeFromDraftInDb(draftId, employeeId, draftRec.draft, role, startOnboarding);
  } catch (error) {
    return jsonErr(409, error instanceof Error ? error.message : 'Unable to create employee in DLE_Enterprise');
  }
  storeOverrides.set(employeeId, override);

  draftRec.status = 'created';
  draftRec.updatedAt = nowIso();
  draftRec.audit.unshift({ id: `audit-${Math.random().toString(16).slice(2)}`, at: draftRec.updatedAt, action: 'Employee created', performedBy: role });
  await saveEmployeeDraftToDb(draftRec);

  if (startOnboarding) {
    draftRec.audit.unshift({ id: `audit-${Math.random().toString(16).slice(2)}`, at: nowIso(), action: 'Onboarding started', performedBy: role });
    return jsonOk({ employeeId, startedOnboarding: true });
  }

  return jsonOk({ employeeId, startedOnboarding: false });
}

export async function GET() {
  try {
    const employees = await readActiveSagePayrollEmployees();
    return jsonOk({
      source: 'Sage 300 People Payroll',
      syncedAt: nowIso(),
      employees: employees.map(toDirectoryEmployee),
    });
  } catch (error) {
    return jsonErr(502, error instanceof Error ? `Unable to read Sage payroll employees: ${error.message}` : 'Unable to read Sage payroll employees');
  }
}
