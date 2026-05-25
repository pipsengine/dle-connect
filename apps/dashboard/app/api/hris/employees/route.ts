import { NextResponse } from 'next/server';

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

const isUniqueEmployeeId = (employeeId: string) => {
  if (!employeeId) return true;
  if (storeOverrides.has(employeeId)) return false;
  for (const d of storeDrafts.values()) {
    const e = normalizeEmployeeId(d.draft?.employment?.employeeId);
    if (e && e === employeeId) return false;
  }
  return true;
};

const finalizeEmployeeId = (draft: EmployeeDraftPayload) => {
  const manual = normalizeEmployeeId(draft.employment?.employeeId);
  if (manual) {
    if (!isUniqueEmployeeId(manual)) throw new Error('Employee ID must be unique');
    return manual;
  }
  for (let i = 0; i < 1000; i++) {
    const n = nextSeq();
    const gen = `DLE-EMP-${String(n).padStart(5, '0')}`;
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
  const draftRec = storeDrafts.get(draftId);
  if (!draftRec) return jsonErr(404, 'Draft not found');
  if (draftRec.status === 'created') return jsonErr(400, 'Draft already created');

  const employeeId = finalizeEmployeeId(draftRec.draft);
  const override = toProfileOverride(employeeId, draftRec.draft);
  storeOverrides.set(employeeId, override);

  draftRec.status = 'created';
  draftRec.updatedAt = nowIso();
  draftRec.audit.unshift({ id: `audit-${Math.random().toString(16).slice(2)}`, at: draftRec.updatedAt, action: 'Employee created', performedBy: role });

  if (mode === 'create-and-start-onboarding') {
    draftRec.audit.unshift({ id: `audit-${Math.random().toString(16).slice(2)}`, at: nowIso(), action: 'Onboarding started', performedBy: role });
    return jsonOk({ employeeId, startedOnboarding: true });
  }

  return jsonOk({ employeeId, startedOnboarding: false });
}

