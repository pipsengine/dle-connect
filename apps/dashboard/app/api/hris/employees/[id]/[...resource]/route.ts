import { NextResponse } from 'next/server';

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
  | 'Field Assignment';

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
  personalInfo: Record<string, string | null>;
  employmentDetails: Record<string, string | null>;
  jobDetails: Record<string, string | null>;
  contacts: Record<string, string | null>;
};

type EmployeeOverview = {
  profileCompletionPct: number;
  leaveBalanceDays: number;
  attendanceScore: number;
  trainingCompliancePct: number;
  performanceRating: 'A' | 'B' | 'C' | 'D' | '—';
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
  history: { id: string; type: string; start: string; end: string; days: number; status: 'Approved' | 'Pending' | 'Rejected' }[];
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
  currentRating: 'A' | 'B' | 'C' | 'D' | '—';
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

type EmployeeRecord = {
  profile: EmployeeProfile;
  overview: EmployeeOverview;
  emergencyContacts: EmergencyContact[];
  documents: DocumentItem[];
  leaveSummary: LeaveSummary;
  attendanceSummary: AttendanceSummary;
  payrollSummary: PayrollSummary;
  performanceSummary: PerformanceSummary;
  training: TrainingRecord[];
  assets: AssetItem[];
  medicalHse: MedicalHSE;
  disciplinary: DisciplinaryRecord[];
  history: HistoryEvent[];
  audit: AuditLog[];
  aiInsights: AIInsight[];
};

const jsonOk = <T,>(data: T) => NextResponse.json({ status: 'success', data });
const jsonErr = (status: number, error: string) => NextResponse.json({ status: 'error', error }, { status });

const rolePermissions = (role: Role, subjectEmployeeId: string, viewerEmployeeId: string | undefined) => {
  const isSelf = viewerEmployeeId ? viewerEmployeeId === subjectEmployeeId : false;
  const canViewPayroll = role === 'Super Admin' || role === 'Payroll Officer' || role === 'HR Director' || role === 'HR Manager' || role === 'Executive Management';
  const canViewMedical = role === 'Super Admin' || role === 'HR Director' || role === 'HSE Officer' || role === 'Compliance Officer';
  const canViewDisciplinary = role === 'Super Admin' || role === 'HR Director' || role === 'HR Manager' || role === 'Compliance Officer';
  const canEdit = role === 'Super Admin' || role === 'HR Director' || role === 'HR Manager' || role === 'HR Officer' || role === 'Admin Officer';
  const canChangeStatus = role === 'Super Admin' || role === 'HR Director' || role === 'HR Manager';
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
    canChangeStatus,
    canViewAudit,
    canViewSensitivePersonal,
    canViewDocuments,
  };
};

const seedFromId = (id: string) => {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

const createSeeded = (seed: number) => {
  let s = seed >>> 0;
  return () => {
    s = (1664525 * s + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
};

const pick = <T,>(rng: () => number, arr: T[]) => arr[Math.floor(rng() * arr.length)];

const months = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];
const isoDate = (rng: () => number, y0: number, y1: number) => {
  const y = y0 + Math.floor(rng() * (y1 - y0 + 1));
  const m = pick(rng, months);
  const d = String(1 + Math.floor(rng() * 28)).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const maskAccount = (s: string) => {
  const digits = s.replace(/\D/g, '');
  if (digits.length < 6) return '••••••';
  const tail = digits.slice(-4);
  return `••••••${tail}`;
};

const validatePhone = (s: string) => /^[+]?[\d\s()-]{7,20}$/.test(s.trim());

const normalizeStr = (v: unknown, max = 200) => {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  if (!t) return null;
  return t.length > max ? t.slice(0, max) : t;
};

const nowIso = () => new Date().toISOString();

const auditEntry = (action: string, performedBy: string, extra?: Partial<AuditLog>): AuditLog => ({
  id: `audit-${Math.random().toString(16).slice(2)}`,
  at: nowIso(),
  action,
  performedBy,
  ipAddress: '10.0.12.44',
  device: 'DLE-HRIS-Web',
  ...extra,
});

const makeRecord = (employeeId: string): EmployeeRecord => {
  const seed = seedFromId(employeeId);
  const rng = createSeeded(seed);
  const first = ['Juan', 'Amina', 'Chinedu', 'Halima', 'Tunde', 'Ngozi', 'Michael', 'Fatima', 'Ade', 'Rita', 'Samuel', 'Zainab', 'Ibrahim', 'Grace', 'Kehinde', 'Bola', 'Chika', 'Emeka', 'Mary', 'David'];
  const last = ['Dela Cruz', 'Okafor', 'Adeoye', 'Bello', 'Eze', 'Uche', 'Johnson', 'Adebayo', 'Aliyu', 'Okonkwo', 'Ibrahim', 'Mohammed', 'Sule', 'Okoro', 'Nwankwo', 'Garcia', 'Torres', 'Mendoza', 'Valdez', 'Reyes'];
  const departments = ['Civil Engineering', 'Mechanical Engineering', 'Electrical & Instrumentation', 'Project Controls', 'HSE', 'Quality Assurance', 'Procurement', 'Finance', 'Human Capital', 'IT & Support', 'Legal & Compliance', 'Executive Office'];
  const businessUnits = ['DLE Projects', 'DLE Fabrication', 'DLE Marine', 'DLE Corporate', 'DLE Energy'];
  const locations = ['Lagos HQ', 'Port Harcourt Office', 'Warri Yard', 'Abuja Office', 'Onne Site', 'Kaduna Site', 'Offshore Platform'];
  const jobTitles = [
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
  ];
  const employmentTypes = ['Permanent', 'Contract', 'Temporary', 'Intern', 'Consultant', 'Expatriate', 'Industrial Trainee', 'NYSC', 'Outsourced Staff'];
  const statuses: EmployeeStatus[] = ['Active', 'On Leave', 'Probation', 'Confirmed', 'Suspended', 'Resigned', 'Terminated', 'Retired', 'Contract', 'Seconded', 'Field Assignment'];
  const relationships = ['Spouse', 'Parent', 'Sibling', 'Child', 'Guardian', 'Friend', 'Partner'];
  const docCategories = [
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
  ];

  const fn = pick(rng, first);
  const ln = pick(rng, last);
  const fullName = `${fn} ${ln}`;
  const department = pick(rng, departments);
  const businessUnit = pick(rng, businessUnits);
  const location = pick(rng, locations);
  const jobTitle = pick(rng, jobTitles);
  const employmentType = pick(rng, employmentTypes);
  const employmentStatus = pick(rng, statuses);
  const dateJoined = `${isoDate(rng, 2012, 2026)}T00:00:00.000Z`;
  const joinedMs = new Date(dateJoined).getTime();
  const yearsOfService = Math.max(0, Math.min(25, Math.floor((Date.now() - joinedMs) / (365.25 * 24 * 3600 * 1000))));
  const reportingManager = `${pick(rng, first)} ${pick(rng, last)}`;

  const baseProfile: EmployeeProfile = {
    id: employeeId,
    employeeId,
    photoUrl: `https://picsum.photos/seed/${encodeURIComponent(employeeId)}/160/160`,
    fullName,
    jobTitle,
    department,
    businessUnit,
    location,
    employmentStatus,
    employmentType,
    reportingManager,
    dateJoined,
    yearsOfService,
    personalInfo: {
      title: pick(rng, ['Mr', 'Mrs', 'Ms', 'Dr', 'Engr']),
      firstName: fn,
      middleName: pick(rng, ['A.', 'B.', 'C.', '—']),
      lastName: ln,
      preferredName: rng() < 0.3 ? fn : null,
      gender: pick(rng, ['Male', 'Female']),
      dateOfBirth: `${isoDate(rng, 1978, 2002)}T00:00:00.000Z`,
      maritalStatus: pick(rng, ['Single', 'Married', 'Divorced', 'Widowed']),
      nationality: pick(rng, ['Nigerian', 'Ghanaian', 'British', 'Indian', 'Filipino', 'South African']),
      stateOfOrigin: pick(rng, ['Lagos', 'Rivers', 'Ogun', 'Abuja (FCT)', 'Kaduna', 'Delta', 'Imo']),
      localGovernmentArea: pick(rng, ['Ikeja', 'Eti-Osa', 'Obio-Akpor', 'Abeokuta South', 'Maitama', 'Warri South']),
      religion: pick(rng, ['Christianity', 'Islam', 'Other']),
      languagesSpoken: pick(rng, ['English, Yoruba', 'English, Igbo', 'English, Hausa', 'English']),
      personalEmail: `${fn.toLowerCase()}.${ln.toLowerCase()}@mail.com`,
      personalPhone: pick(rng, ['+234 803 123 4567', '+234 802 555 0199', '+234 901 222 3344']),
      residentialAddress: pick(rng, ['Lekki, Lagos', 'GRA, Port Harcourt', 'Asokoro, Abuja', 'Warri, Delta']),
      permanentAddress: pick(rng, ['Surulere, Lagos', 'Aba Road, Port Harcourt', 'Wuse 2, Abuja', 'Sapele Road, Benin']),
    },
    employmentDetails: {
      employeeId,
      employmentType,
      employmentStatus,
      dateJoined: dateJoined.slice(0, 10),
      confirmationDate: rng() < 0.6 ? isoDate(rng, 2013, 2026) : null,
      probationStartDate: rng() < 0.5 ? isoDate(rng, 2012, 2026) : null,
      probationEndDate: rng() < 0.5 ? isoDate(rng, 2012, 2026) : null,
      contractStartDate: employmentType === 'Contract' ? isoDate(rng, 2023, 2026) : null,
      contractEndDate: employmentType === 'Contract' ? isoDate(rng, 2026, 2027) : null,
      exitDate: ['Resigned', 'Terminated', 'Retired'].includes(employmentStatus) ? isoDate(rng, 2024, 2026) : null,
      exitReason: ['Resigned', 'Terminated', 'Retired'].includes(employmentStatus) ? pick(rng, ['Resignation', 'Termination', 'Retirement']) : null,
      rehireEligibility: rng() < 0.7 ? 'Eligible' : 'Not Eligible',
      workLocation: location,
      workMode: pick(rng, ['Onsite', 'Hybrid', 'Remote']),
      shiftPattern: pick(rng, ['Day', 'Night', 'Rotational']),
      staffCategory: pick(rng, ['Senior Staff', 'Junior Staff', 'Contractor']),
      employeeCategory: pick(rng, ['Operations', 'Corporate Services', 'Projects', 'Commercial']),
      unionStatus: rng() < 0.3 ? 'Union' : 'Non-Union',
    },
    jobDetails: {
      jobTitle,
      designation: pick(rng, ['Engineer', 'Supervisor', 'Manager', 'Officer', 'Specialist']),
      jobGrade: pick(rng, ['G7', 'G8', 'G9', 'G10', 'G11']),
      department,
      division: pick(rng, ['Engineering', 'Operations', 'Corporate Services', 'Projects', 'Commercial']),
      businessUnit,
      costCenter: pick(rng, ['CC-ENG-001', 'CC-OPS-004', 'CC-HR-002', 'CC-FIN-003']),
      projectSite: pick(rng, ['Lekki Project', 'NLNG Train 7', 'Bonny Island', 'Onshore Pipeline', 'Fabrication Bay', 'N/A']),
      reportingManager,
      functionalManager: rng() < 0.4 ? `${pick(rng, first)} ${pick(rng, last)}` : null,
      departmentHead: `${pick(rng, first)} ${pick(rng, last)}`,
      hrBusinessPartner: `${pick(rng, first)} ${pick(rng, last)}`,
      roleProfile: pick(rng, ['Role-based access: HR Generalist', 'Role-based access: Project Delivery', 'Role-based access: Finance Ops']),
      jobDescription: 'Enterprise role profile with responsibilities aligned to DLE operational standards.',
      keyResponsibilities: 'Operational delivery, compliance adherence, reporting accuracy, and continuous improvement.',
    },
    contacts: {
      officialEmail: `${fn.toLowerCase()}.${ln.toLowerCase()}@dle.com`,
      personalEmail: `${fn.toLowerCase()}.${ln.toLowerCase()}@mail.com`,
      officeExtension: pick(rng, ['1203', '2210', '3301', '4102', '—']),
      primaryPhone: pick(rng, ['+234 803 123 4567', '+234 802 555 0199', '+234 901 222 3344']),
      alternativePhone: rng() < 0.5 ? pick(rng, ['+234 806 111 2233', '+234 809 333 4400']) : null,
      nearestBusStop: pick(rng, ['Chevron', 'CMS', 'Yaba', 'Garrison', 'Wuse Market']),
      city: pick(rng, ['Lagos', 'Port Harcourt', 'Abuja', 'Warri', 'Kaduna']),
      state: pick(rng, ['Lagos', 'Rivers', 'FCT', 'Delta', 'Kaduna']),
      country: 'Nigeria',
      postalCode: pick(rng, ['100001', '500001', '900001', '320001']),
    },
  };

  const emergencyContacts: EmergencyContact[] = Array.from({ length: 1 + Math.floor(rng() * 2) }).map((_, i) => {
    const cfn = pick(rng, first);
    const cln = pick(rng, last);
    const isPrimary = i === 0;
    return {
      id: `ec-${employeeId}-${i}`,
      fullName: `${cfn} ${cln}`,
      relationship: pick(rng, relationships),
      phoneNumber: pick(rng, ['+234 803 555 2233', '+234 802 111 9090', '+234 901 333 1010']),
      alternativePhone: rng() < 0.4 ? pick(rng, ['+234 806 444 8888', '+234 809 100 2003']) : null,
      email: rng() < 0.4 ? `${cfn.toLowerCase()}.${cln.toLowerCase()}@mail.com` : null,
      address: rng() < 0.4 ? pick(rng, ['Lekki, Lagos', 'GRA, Port Harcourt', 'Asokoro, Abuja']) : null,
      isPrimary,
      isNextOfKin: isPrimary,
      isBeneficiary: rng() < 0.5,
    };
  });

  const documents: DocumentItem[] = Array.from({ length: 6 + Math.floor(rng() * 6) }).map((_, i) => {
    const category = pick(rng, docCategories);
    const ext = pick(rng, ['pdf', 'jpg', 'png']);
    const uploadedAt = `${isoDate(rng, 2024, 2026)}T${String(Math.floor(rng() * 23)).padStart(2, '0')}:${String(Math.floor(rng() * 59)).padStart(2, '0')}:00.000Z`;
    const expiresAt = rng() < 0.35 ? `${isoDate(rng, 2026, 2028)}T00:00:00.000Z` : null;
    const status: DocumentItem['status'] = rng() < 0.6 ? 'Verified' : rng() < 0.85 ? 'Uploaded' : 'Rejected';
    return {
      id: `doc-${employeeId}-${i}`,
      category,
      fileName: `${category.replace(/\s+/g, '_').toLowerCase()}_${i}.${ext}`,
      mimeType: ext === 'pdf' ? 'application/pdf' : ext === 'jpg' ? 'image/jpeg' : 'image/png',
      sizeBytes: 180_000 + Math.floor(rng() * 1_800_000),
      status,
      uploadedAt,
      expiresAt,
      verifiedBy: status === 'Verified' ? 'HR Compliance' : null,
    };
  });

  const leaveSummary: LeaveSummary = {
    balances: {
      'Annual Leave': 8 + Math.floor(rng() * 18),
      'Sick Leave': 3 + Math.floor(rng() * 6),
      'Maternity Leave': rng() < 0.3 ? 0 : 0,
      'Paternity Leave': rng() < 0.3 ? 0 : 0,
      'Compassionate Leave': 1 + Math.floor(rng() * 4),
      'Study Leave': Math.floor(rng() * 6),
      'Unpaid Leave': Math.floor(rng() * 6),
      'Emergency Leave': Math.floor(rng() * 3),
    },
    history: Array.from({ length: 6 + Math.floor(rng() * 6) }).map((_, i) => {
      const type = pick(rng, ['Annual Leave', 'Sick Leave', 'Compassionate Leave', 'Study Leave', 'Unpaid Leave', 'Emergency Leave']);
      const start = `${isoDate(rng, 2024, 2026)}T00:00:00.000Z`;
      const days = 1 + Math.floor(rng() * 10);
      const endMs = new Date(start).getTime() + (days - 1) * 24 * 3600 * 1000;
      const end = new Date(endMs).toISOString();
      const status: LeaveSummary['history'][number]['status'] = rng() < 0.68 ? 'Approved' : rng() < 0.86 ? 'Pending' : 'Rejected';
      return { id: `lv-${employeeId}-${i}`, type, start, end, days, status };
    }),
  };

  const attendanceScore = 62 + Math.floor(rng() * 35);
  const attendanceSummary: AttendanceSummary = {
    score: attendanceScore,
    presentDays: 18 + Math.floor(rng() * 8),
    absentDays: Math.floor(rng() * 3),
    lateComing: Math.floor(rng() * 6),
    earlyDeparture: Math.floor(rng() * 5),
    overtimeHours: Math.floor(rng() * 25),
    biometricLogs: Array.from({ length: 10 }).map((_, i) => {
      const at = `${isoDate(rng, 2026, 2026)}T${String(7 + Math.floor(rng() * 4)).padStart(2, '0')}:${String(Math.floor(rng() * 59)).padStart(2, '0')}:00.000Z`;
      return { id: `bio-${employeeId}-${i}`, at, source: pick(rng, ['Biometric', 'Mobile', 'Access Control']), status: pick(rng, ['IN', 'OUT']) };
    }),
  };

  const payrollSummary: PayrollSummary = {
    payrollStatus: rng() < 0.7 ? 'Verified' : 'Pending Validation',
    salaryGrade: pick(rng, ['SG-07', 'SG-08', 'SG-09', 'SG-10', 'SG-11']),
    basicSalary: 450_000 + Math.floor(rng() * 1_850_000),
    allowances: 60_000 + Math.floor(rng() * 420_000),
    deductions: 30_000 + Math.floor(rng() * 250_000),
    bankName: pick(rng, ['GTBank', 'Access Bank', 'Zenith Bank', 'FirstBank', 'UBA']),
    accountNumberMasked: maskAccount(pick(rng, ['0123456789', '1029384756', '9911223344'])),
    pensionProvider: pick(rng, ['ARM Pensions', 'Stanbic IBTC', 'Leadway Pensure', 'PENCOM']),
    taxId: pick(rng, ['TX-198220', 'TX-991120', 'TX-550012']),
    payrollGroup: pick(rng, ['Monthly', 'Bi-Weekly', 'Project-Based']),
    lastPayrollProcessed: `${isoDate(rng, 2026, 2026)}T00:00:00.000Z`,
  };

  const performanceSummary: PerformanceSummary = {
    currentRating: pick(rng, ['A', 'B', 'B', 'C', '—'] as PerformanceSummary['currentRating'][]),
    lastReviewAt: rng() < 0.55 ? `${isoDate(rng, 2025, 2026)}T00:00:00.000Z` : null,
    goals: Array.from({ length: 3 + Math.floor(rng() * 3) }).map((_, i) => ({
      id: `g-${employeeId}-${i}`,
      title: pick(rng, ['Reduce rework rate', 'Improve HSE compliance', 'Optimize schedule adherence', 'Mentor junior engineers', 'Accelerate project closeout']),
      progressPct: 10 + Math.floor(rng() * 90),
      status: pick(rng, ['On Track', 'At Risk', 'Completed'] as PerformanceSummary['goals'][number]['status'][]),
    })),
    managerFeedback: rng() < 0.55 ? 'Consistent delivery with strong compliance posture; focus on documentation cycle time improvements.' : null,
    aiSignals: [
      { id: `ai-perf-${employeeId}-0`, title: 'No recent performance review found', severity: 'medium', confidence: 0.84 },
      { id: `ai-perf-${employeeId}-1`, title: 'Promotion readiness requires additional training evidence', severity: 'low', confidence: 0.72 },
    ],
  };

  const training: TrainingRecord[] = Array.from({ length: 6 + Math.floor(rng() * 6) }).map((_, i) => {
    const completed = rng() < 0.62;
    const expired = completed && rng() < 0.18;
    const completionDate = completed ? `${isoDate(rng, 2024, 2026)}T00:00:00.000Z` : null;
    const expiryDate = completed ? `${isoDate(rng, 2026, 2028)}T00:00:00.000Z` : null;
    return {
      id: `tr-${employeeId}-${i}`,
      trainingName: pick(rng, ['HSE Induction', 'Permit to Work', 'Project Controls Basics', 'Anti-Bribery & Corruption', 'Data Protection', 'Leadership Essentials']),
      provider: pick(rng, ['DLE Academy', 'External Provider', 'OEM Training']),
      completionDate,
      expiryDate: expired ? `${isoDate(rng, 2024, 2025)}T00:00:00.000Z` : expiryDate,
      status: expired ? 'Expired' : completed ? 'Completed' : 'Pending',
      score: completed ? 60 + Math.floor(rng() * 40) : null,
    };
  });

  const assets: AssetItem[] = Array.from({ length: 1 + Math.floor(rng() * 4) }).map((_, i) => ({
    id: `as-${employeeId}-${i}`,
    assetType: pick(rng, ['Laptop', 'Phone', 'Access Card', 'PPE', 'Software License', 'Office Equipment']),
    assetTag: `DLE-ASSET-${String(1000 + Math.floor(rng() * 8999))}`,
    assetName: pick(rng, ['Dell Latitude', 'HP EliteBook', 'iPhone', 'Android Phone', 'RFID Access Card', 'PPE Kit', 'AutoCAD License']),
    serialNumber: `SN-${String(100000 + Math.floor(rng() * 899999))}`,
    assignedDate: `${isoDate(rng, 2024, 2026)}T00:00:00.000Z`,
    condition: pick(rng, ['Good', 'Fair', 'Needs Repair'] as AssetItem['condition'][]),
    returnStatus: pick(rng, ['Assigned', 'Returned'] as AssetItem['returnStatus'][]),
    returnDate: rng() < 0.3 ? `${isoDate(rng, 2025, 2026)}T00:00:00.000Z` : null,
  }));

  const medicalHse: MedicalHSE = {
    medicalFitnessStatus: pick(rng, ['Fit', 'Fit with restrictions', 'Pending']),
    bloodGroup: pick(rng, ['A+', 'A-', 'B+', 'B-', 'AB+', 'O+', 'O-']),
    knownAllergies: rng() < 0.4 ? pick(rng, ['None', 'Peanuts', 'Dust', 'Seafood']) : null,
    medicalRestrictions: rng() < 0.35 ? 'Requires PPE compliance for confined space operations.' : null,
    fitToWorkStatus: pick(rng, ['Fit-to-Work', 'Restricted', 'Pending Review']),
    incidentHistory: Array.from({ length: Math.floor(rng() * 3) }).map((_, i) => ({
      id: `inc-${employeeId}-${i}`,
      at: `${isoDate(rng, 2024, 2026)}T00:00:00.000Z`,
      title: pick(rng, ['Near miss reported', 'First aid incident', 'PPE non-compliance']),
      severity: pick(rng, ['low', 'medium', 'high'] as Severity[]),
      status: pick(rng, ['Closed', 'Investigating', 'Action Required']),
    })),
    hseCertifications: Array.from({ length: 2 + Math.floor(rng() * 3) }).map((_, i) => ({
      id: `hse-${employeeId}-${i}`,
      name: pick(rng, ['BOSIET', 'H2S Awareness', 'Fire Warden', 'First Aid', 'Working at Height']),
      expiryDate: rng() < 0.8 ? `${isoDate(rng, 2026, 2028)}T00:00:00.000Z` : null,
      status: rng() < 0.8 ? 'Valid' : 'Expired',
    })),
  };

  const disciplinary: DisciplinaryRecord[] = Array.from({ length: Math.floor(rng() * 3) }).map((_, i) => ({
    id: `disc-${employeeId}-${i}`,
    caseType: pick(rng, ['Warning', 'Query', 'Investigation', 'Suspension']),
    dateReported: `${isoDate(rng, 2024, 2026)}T00:00:00.000Z`,
    description: 'Case record captured for compliance and traceability.',
    actionTaken: rng() < 0.6 ? pick(rng, ['Written warning issued', 'Training assigned', 'Suspension applied']) : null,
    status: pick(rng, ['Open', 'Closed', 'Appealed'] as DisciplinaryRecord['status'][]),
    approver: rng() < 0.7 ? 'HR Director' : null,
  }));

  const history: HistoryEvent[] = [
    { id: `h-${employeeId}-0`, at: dateJoined, type: 'Employee Created', detail: 'Employee record created in HRIS', actor: 'HR Officer' },
    { id: `h-${employeeId}-1`, at: `${isoDate(rng, 2013, 2016)}T00:00:00.000Z`, type: 'Employee Confirmed', detail: 'Probation completed and confirmation approved', actor: 'HR Manager' },
    { id: `h-${employeeId}-2`, at: `${isoDate(rng, 2017, 2020)}T00:00:00.000Z`, type: 'Promotion', detail: 'Promotion applied to new grade and role', actor: 'HR Director' },
    { id: `h-${employeeId}-3`, at: `${isoDate(rng, 2022, 2026)}T00:00:00.000Z`, type: 'Manager Change', detail: 'Reporting manager updated', actor: 'Department Head' },
  ].sort((a, b) => (a.at < b.at ? 1 : -1));

  const audit: AuditLog[] = [
    auditEntry('Viewed profile', 'HR Manager'),
    auditEntry('Viewed payroll', 'Payroll Officer', { reason: 'Payroll validation' }),
    auditEntry('Downloaded document', 'HR Officer', { reason: 'Compliance review' }),
  ];

  const aiInsights: AIInsight[] = [
    { id: `ai-${employeeId}-0`, severity: 'high', confidence: 0.92, title: 'Emergency contact missing', recommendation: 'Add at least one emergency contact and mark primary.', actionLabel: 'Open Emergency', action: 'tab.emergency' },
    { id: `ai-${employeeId}-1`, severity: 'medium', confidence: 0.87, title: 'Training compliance incomplete', recommendation: 'Assign mandatory trainings and track certificates.', actionLabel: 'Open Training', action: 'tab.training' },
    { id: `ai-${employeeId}-2`, severity: 'medium', confidence: 0.81, title: 'Attendance risk detected', recommendation: 'Review lateness pattern and trigger coaching workflow.', actionLabel: 'Open Attendance', action: 'tab.attendance' },
    { id: `ai-${employeeId}-3`, severity: 'low', confidence: 0.74, title: 'Payroll data requires validation', recommendation: 'Reconcile salary grade and bank details with payroll group.', actionLabel: 'Open Payroll', action: 'tab.payroll' },
  ];

  const overview: EmployeeOverview = {
    profileCompletionPct: 78 + Math.floor(rng() * 18),
    leaveBalanceDays: 6 + Math.floor(rng() * 18),
    attendanceScore,
    trainingCompliancePct: 60 + Math.floor(rng() * 38),
    performanceRating: performanceSummary.currentRating,
    payrollStatus: payrollSummary.payrollStatus === 'Verified' ? 'Verified' : 'Pending Validation',
    documentStatus: documents.some((d) => d.status === 'Rejected') ? 'Missing' : documents.some((d) => d.expiresAt) ? 'Expiring' : 'Compliant',
    assetStatus: assets.length > 0 ? 'Assigned' : 'None',
    currentLeaveStatus: rng() < 0.12 ? 'On Leave' : rng() < 0.2 ? 'Pending' : 'None',
    recentActivity: [
      { id: `ra-${employeeId}-0`, at: nowIso(), title: 'Profile viewed', detail: 'Employee profile accessed by authorized user.', actor: 'HR Manager' },
      { id: `ra-${employeeId}-1`, at: nowIso(), title: 'Documents checked', detail: 'Compliance document review executed.', actor: 'Compliance Officer' },
      { id: `ra-${employeeId}-2`, at: nowIso(), title: 'Attendance signal', detail: 'AI attendance risk flagged for review.', actor: 'AI Engine' },
    ],
  };

  return {
    profile: baseProfile,
    overview,
    emergencyContacts,
    documents,
    leaveSummary,
    attendanceSummary,
    payrollSummary,
    performanceSummary,
    training,
    assets,
    medicalHse,
    disciplinary,
    history,
    audit,
    aiInsights,
  };
};

const store = (() => {
  const g = globalThis as unknown as { __dleHrisEmployees?: Map<string, EmployeeRecord> };
  if (!g.__dleHrisEmployees) g.__dleHrisEmployees = new Map();
  return g.__dleHrisEmployees;
})();

const overridesStore = (() => {
  const g = globalThis as unknown as { __dleHrisEmployeeOverrides?: Map<string, any> };
  if (!g.__dleHrisEmployeeOverrides) g.__dleHrisEmployeeOverrides = new Map();
  return g.__dleHrisEmployeeOverrides;
})();

const applyOverrides = (employeeId: string, rec: EmployeeRecord) => {
  const ov = overridesStore.get(employeeId);
  if (!ov || typeof ov !== 'object') return rec;

  const profile = (ov.profile && typeof ov.profile === 'object' ? ov.profile : null) as any;
  if (profile) {
    const patchStr = (v: any) => (typeof v === 'string' && v.trim() ? v.trim() : null);
    const patchISO = (v: any) => (typeof v === 'string' && v.trim() ? v.trim() : null);

    rec.profile.employeeId = employeeId;
    const fullName = patchStr(profile.fullName);
    if (fullName) rec.profile.fullName = fullName;
    const jobTitle = patchStr(profile.jobTitle);
    if (jobTitle) rec.profile.jobTitle = jobTitle;
    const department = patchStr(profile.department);
    if (department) rec.profile.department = department;
    const businessUnit = patchStr(profile.businessUnit);
    if (businessUnit) rec.profile.businessUnit = businessUnit;
    const location = patchStr(profile.location);
    if (location) rec.profile.location = location;
    const employmentStatus = patchStr(profile.employmentStatus) as EmployeeStatus | null;
    if (employmentStatus) rec.profile.employmentStatus = employmentStatus;
    const employmentType = patchStr(profile.employmentType);
    if (employmentType) rec.profile.employmentType = employmentType;
    const reportingManager = patchStr(profile.reportingManager);
    if (reportingManager) rec.profile.reportingManager = reportingManager;
    const dateJoined = patchISO(profile.dateJoined);
    if (dateJoined) rec.profile.dateJoined = dateJoined;

    const mergeObj = (target: Record<string, string | null>, src: any) => {
      if (!src || typeof src !== 'object') return target;
      for (const [k, v] of Object.entries(src)) {
        if (typeof v === 'string') target[k] = v;
        else if (v === null) target[k] = null;
      }
      return target;
    };

    mergeObj(rec.profile.personalInfo, profile.personalInfo);
    mergeObj(rec.profile.employmentDetails, profile.employmentDetails);
    mergeObj(rec.profile.jobDetails, profile.jobDetails);
    mergeObj(rec.profile.contacts, profile.contacts);
  }

  if (Array.isArray(ov.emergencyContacts)) {
    rec.emergencyContacts = ov.emergencyContacts
      .filter((x: any) => x && typeof x === 'object')
      .map((x: any, idx: number) => ({
        id: typeof x.id === 'string' ? x.id : `ec-${employeeId}-${idx}`,
        fullName: typeof x.fullName === 'string' ? x.fullName : '—',
        relationship: typeof x.relationship === 'string' ? x.relationship : '—',
        phoneNumber: typeof x.phoneNumber === 'string' ? x.phoneNumber : '—',
        alternativePhone: typeof x.alternativePhone === 'string' ? x.alternativePhone : typeof x.alternatePhone === 'string' ? x.alternatePhone : null,
        email: typeof x.email === 'string' ? x.email : null,
        address: typeof x.address === 'string' ? x.address : null,
        isPrimary: !!x.isPrimary,
        isNextOfKin: !!x.isNextOfKin,
        isBeneficiary: !!x.isBeneficiary,
      }));
  }

  if (Array.isArray(ov.documents)) {
    rec.documents = ov.documents
      .filter((d: any) => d && typeof d === 'object')
      .map((d: any, idx: number) => ({
        id: typeof d.id === 'string' ? d.id : `doc-${employeeId}-${idx}`,
        category: typeof d.category === 'string' ? d.category : 'Document',
        fileName: typeof d.fileName === 'string' ? d.fileName : 'file',
        mimeType: typeof d.mimeType === 'string' ? d.mimeType : 'application/octet-stream',
        sizeBytes: typeof d.sizeBytes === 'number' ? d.sizeBytes : 0,
        status: (typeof d.status === 'string' ? d.status : 'Uploaded') as DocumentItem['status'],
        uploadedAt: typeof d.uploadedAt === 'string' ? d.uploadedAt : new Date().toISOString(),
        expiresAt: typeof d.expiresAt === 'string' ? d.expiresAt : d.expiresAt === null ? null : null,
        verifiedBy: typeof d.verifiedBy === 'string' ? d.verifiedBy : null,
      }));
  }

  if (ov.payroll && typeof ov.payroll === 'object') {
    const toNum = (v: any) => {
      if (typeof v === 'number' && Number.isFinite(v)) return v;
      if (typeof v !== 'string') return null;
      const n = Number(v.replace(/[^\d.]/g, ''));
      return Number.isFinite(n) ? n : null;
    };
    const p = ov.payroll as any;
    rec.payrollSummary = {
      payrollStatus: p.setupAssignedToPayroll ? 'Pending Validation' : 'Verified',
      salaryGrade: typeof p.salaryGrade === 'string' && p.salaryGrade.trim() ? p.salaryGrade.trim() : rec.payrollSummary.salaryGrade,
      basicSalary: toNum(p.basicSalary),
      allowances: null,
      deductions: null,
      bankName: typeof p.bankName === 'string' && p.bankName.trim() ? p.bankName.trim() : null,
      accountNumberMasked: typeof p.accountNumber === 'string' && p.accountNumber.trim() ? `••••••${p.accountNumber.replace(/\D/g, '').slice(-4)}` : rec.payrollSummary.accountNumberMasked,
      pensionProvider: typeof p.pensionProvider === 'string' && p.pensionProvider.trim() ? p.pensionProvider.trim() : null,
      taxId: typeof p.taxId === 'string' && p.taxId.trim() ? p.taxId.trim() : null,
      payrollGroup: typeof p.payrollGroup === 'string' && p.payrollGroup.trim() ? p.payrollGroup.trim() : null,
      lastPayrollProcessed: null,
    };
  }

  if (Array.isArray(ov.onboardingChecklist)) {
    const created = ov.onboardingChecklist.length > 0;
    if (created) {
      rec.history.unshift({
        id: `h-${employeeId}-${Math.random().toString(16).slice(2)}`,
        at: new Date().toISOString(),
        type: 'Onboarding Checklist Generated',
        detail: `Checklist items: ${ov.onboardingChecklist.length}`,
        actor: 'HRIS',
      });
    }
  }

  return rec;
};

const ensureRecord = (employeeId: string) => {
  const existing = store.get(employeeId);
  if (existing) return applyOverrides(employeeId, existing);
  const next = makeRecord(employeeId);
  const merged = applyOverrides(employeeId, next);
  store.set(employeeId, merged);
  return merged;
};

const getRole = (request: Request): Role => {
  const v = request.headers.get('x-hris-role');
  const all: Role[] = [
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
  ];
  return (all.includes(v as Role) ? (v as Role) : 'HR Manager') as Role;
};

const getViewerEmployeeId = (request: Request) => {
  const v = request.headers.get('x-hris-employee-id');
  return v && v.trim() ? v.trim() : undefined;
};

const getResource = (segments: string[]) => ({
  root: segments[0] || '',
  rest: segments.slice(1),
});

const sanitizeProfileForRole = (rec: EmployeeRecord, perms: ReturnType<typeof rolePermissions>) => {
  const profile: EmployeeProfile = JSON.parse(JSON.stringify(rec.profile)) as EmployeeProfile;
  if (!perms.canViewSensitivePersonal) {
    const p = profile.personalInfo;
    p.dateOfBirth = null;
    p.maritalStatus = null;
    p.religion = null;
    p.residentialAddress = null;
    p.permanentAddress = null;
    p.personalPhone = null;
  }
  if (!perms.canViewDocuments) {
    profile.personalInfo.personalEmail = null;
  }
  return profile;
};

type ProfilePayload = EmployeeProfile & {
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
};

const sanitizePayrollForRole = (payroll: PayrollSummary, perms: ReturnType<typeof rolePermissions>): PayrollSummary => {
  if (perms.canViewPayroll) return payroll;
  return {
    payrollStatus: 'Masked',
    salaryGrade: payroll.salaryGrade,
    basicSalary: null,
    allowances: null,
    deductions: null,
    bankName: null,
    accountNumberMasked: payroll.accountNumberMasked ? payroll.accountNumberMasked : null,
    pensionProvider: null,
    taxId: null,
    payrollGroup: null,
    lastPayrollProcessed: null,
  };
};

const sanitizePayloadForRole = (rec: EmployeeRecord, perms: ReturnType<typeof rolePermissions>): ProfilePayload => {
  const profile = sanitizeProfileForRole(rec, perms);
  const overview = perms.canViewPayroll ? rec.overview : ({ ...rec.overview, payrollStatus: 'Masked' } satisfies EmployeeOverview);
  return {
    ...profile,
    overview,
    emergencyContacts: rec.emergencyContacts,
    documents: perms.canViewDocuments ? rec.documents : [],
    leaveSummary: rec.leaveSummary,
    attendanceSummary: rec.attendanceSummary,
    payrollSummary: sanitizePayrollForRole(rec.payrollSummary, perms),
    performanceSummary: rec.performanceSummary,
    training: rec.training,
    assets: rec.assets,
    medicalHse: perms.canViewMedical ? rec.medicalHse : null,
    disciplinary: perms.canViewDisciplinary ? rec.disciplinary : null,
    history: rec.history,
    aiInsights: rec.aiInsights,
  };
};

const validateEmergencyContacts = (items: EmergencyContact[]) => {
  if (items.length < 1) return 'At least one emergency contact is required';
  if (!items.some((c) => c.isPrimary)) return 'One emergency contact must be marked as primary';
  for (const c of items) {
    if (!c.fullName.trim()) return 'Emergency contact full name is required';
    if (!c.relationship.trim()) return 'Emergency contact relationship is required';
    if (!validatePhone(c.phoneNumber)) return 'Emergency contact phone number is invalid';
  }
  return null;
};

export async function GET(request: Request, ctx: { params: Promise<{ id: string; resource: string[] }> }) {
  const { id, resource } = await ctx.params;
  const employeeId = id;
  const role = getRole(request);
  const viewerEmployeeId = getViewerEmployeeId(request);
  if (role === 'Employee' && (!viewerEmployeeId || viewerEmployeeId !== employeeId)) return jsonErr(403, 'Permission denied');
  const perms = rolePermissions(role, employeeId, viewerEmployeeId);
  if (!perms.canViewProfile) return jsonErr(403, 'Permission denied');

  const rec = ensureRecord(employeeId);
  const { root } = getResource(resource);
  if (!root) return jsonErr(404, 'Not found');

  if (root === 'profile') return jsonOk(sanitizePayloadForRole(rec, perms));
  if (root === 'overview') {
    if (perms.canViewPayroll) return jsonOk(rec.overview);
    return jsonOk({ ...rec.overview, payrollStatus: 'Masked' } satisfies EmployeeOverview);
  }
  if (root === 'personal-info') return jsonOk(sanitizeProfileForRole(rec, perms).personalInfo);
  if (root === 'employment') return jsonOk(rec.profile.employmentDetails);
  if (root === 'job') return jsonOk(rec.profile.jobDetails);
  if (root === 'contacts') return jsonOk(rec.profile.contacts);
  if (root === 'emergency-contacts') return jsonOk(rec.emergencyContacts);
  if (root === 'documents') {
    if (!perms.canViewDocuments) return jsonErr(403, 'Permission denied');
    return jsonOk(rec.documents);
  }
  if (root === 'leave-summary') return jsonOk(rec.leaveSummary);
  if (root === 'attendance-summary') return jsonOk(rec.attendanceSummary);
  if (root === 'payroll-summary') return jsonOk(sanitizePayrollForRole(rec.payrollSummary, perms));
  if (root === 'performance-summary') return jsonOk(rec.performanceSummary);
  if (root === 'training') return jsonOk(rec.training);
  if (root === 'assets') return jsonOk(rec.assets);
  if (root === 'history') return jsonOk(rec.history);
  if (root === 'employment-history') {
    const g = globalThis as unknown as { __dleHrisEmploymentHistoryDetail?: Map<string, any> };
    const map = g.__dleHrisEmploymentHistoryDetail;
    if (!map) return jsonOk([]);
    const items = Array.from(map.values()).filter((x) => x && x.employeeId === employeeId);
    items.sort((a, b) => (a.effectiveDate < b.effectiveDate ? 1 : -1));
    return jsonOk(items);
  }
  if (root === 'audit-trail') {
    if (!perms.canViewAudit) return jsonErr(403, 'Permission denied');
    return jsonOk(rec.audit);
  }
  if (root === 'ai-insights') return jsonOk(rec.aiInsights);
  if (root === 'status') return jsonOk({ employmentStatus: rec.profile.employmentStatus });

  return jsonErr(404, 'Not found');
}

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string; resource: string[] }> }) {
  const { id, resource } = await ctx.params;
  const employeeId = id;
  const role = getRole(request);
  const viewerEmployeeId = getViewerEmployeeId(request);
  if (role === 'Employee' && (!viewerEmployeeId || viewerEmployeeId !== employeeId)) return jsonErr(403, 'Permission denied');
  const perms = rolePermissions(role, employeeId, viewerEmployeeId);
  if (!perms.canViewProfile) return jsonErr(403, 'Permission denied');
  if (!perms.canEdit && resource[0] !== 'status') return jsonErr(403, 'Permission denied');

  const rec = ensureRecord(employeeId);
  const { root, rest } = getResource(resource);
  const body = (await request.json().catch(() => null)) as any;
  if (!body) return jsonErr(400, 'Invalid JSON body');

  if (root === 'personal-info') {
    const next = { ...rec.profile.personalInfo };
    for (const k of Object.keys(next)) {
      if (!(k in body)) continue;
      const v = normalizeStr(body[k], 500);
      next[k] = v;
    }
    const phone = body.personalPhone ? normalizeStr(body.personalPhone, 40) : null;
    if (phone && !validatePhone(phone)) return jsonErr(400, 'Phone number must be valid');
    if (phone) next.personalPhone = phone;
    rec.profile.personalInfo = next;
    rec.audit.unshift(auditEntry('Edited personal information', role));
    return jsonOk(sanitizeProfileForRole(rec, perms).personalInfo);
  }

  if (root === 'employment') {
    const next = { ...rec.profile.employmentDetails };
    for (const k of Object.keys(next)) {
      if (!(k in body)) continue;
      next[k] = normalizeStr(body[k], 200);
    }
    const dateJoined = next.dateJoined ? new Date(`${next.dateJoined}T00:00:00.000Z`).getTime() : null;
    if (dateJoined && dateJoined > Date.now()) return jsonErr(400, 'Date joined cannot be future date');
    const ps = next.probationStartDate ? new Date(`${next.probationStartDate}T00:00:00.000Z`).getTime() : null;
    const pe = next.probationEndDate ? new Date(`${next.probationEndDate}T00:00:00.000Z`).getTime() : null;
    if (ps && pe && pe < ps) return jsonErr(400, 'Probation end date cannot be before probation start date');
    const cs = next.contractStartDate ? new Date(`${next.contractStartDate}T00:00:00.000Z`).getTime() : null;
    const ce = next.contractEndDate ? new Date(`${next.contractEndDate}T00:00:00.000Z`).getTime() : null;
    if (cs && ce && ce < cs) return jsonErr(400, 'Contract end date cannot be before contract start date');
    const exit = next.exitDate ? new Date(`${next.exitDate}T00:00:00.000Z`).getTime() : null;
    if (exit && dateJoined && exit < dateJoined) return jsonErr(400, 'Exit date cannot be before date joined');
    rec.profile.employmentDetails = next;
    rec.audit.unshift(auditEntry('Updated employment details', role));
    return jsonOk(rec.profile.employmentDetails);
  }

  if (root === 'job') {
    const next = { ...rec.profile.jobDetails };
    for (const k of Object.keys(next)) {
      if (!(k in body)) continue;
      next[k] = normalizeStr(body[k], 500);
    }
    if (body.reportingManager && normalizeStr(body.reportingManager, 200) === rec.profile.fullName) return jsonErr(400, 'Manager cannot be same as employee');
    rec.profile.jobDetails = next;
    if (typeof next.jobTitle === 'string' && next.jobTitle.trim()) rec.profile.jobTitle = next.jobTitle;
    if (typeof next.department === 'string' && next.department.trim()) rec.profile.department = next.department;
    if (typeof next.businessUnit === 'string' && next.businessUnit.trim()) rec.profile.businessUnit = next.businessUnit;
    if (typeof next.reportingManager === 'string' && next.reportingManager.trim()) rec.profile.reportingManager = next.reportingManager;
    rec.audit.unshift(auditEntry('Changed department/job details', role));
    return jsonOk(rec.profile.jobDetails);
  }

  if (root === 'contacts') {
    const next = { ...rec.profile.contacts };
    for (const k of Object.keys(next)) {
      if (!(k in body)) continue;
      next[k] = normalizeStr(body[k], 500);
    }
    const phone = body.primaryPhone ? normalizeStr(body.primaryPhone, 40) : null;
    if (phone && !validatePhone(phone)) return jsonErr(400, 'Phone number must be valid');
    if (phone) next.primaryPhone = phone;
    rec.profile.contacts = next;
    rec.audit.unshift(auditEntry('Updated contact information', role));
    return jsonOk(rec.profile.contacts);
  }

  if (root === 'emergency-contacts') {
    const contactId = rest[0];
    if (!contactId) return jsonErr(400, 'Missing contactId');
    const idx = rec.emergencyContacts.findIndex((c) => c.id === contactId);
    if (idx < 0) return jsonErr(404, 'Emergency contact not found');
    const current = rec.emergencyContacts[idx];
    const next: EmergencyContact = {
      ...current,
      fullName: normalizeStr(body.fullName, 200) ?? current.fullName,
      relationship: normalizeStr(body.relationship, 120) ?? current.relationship,
      phoneNumber: normalizeStr(body.phoneNumber, 40) ?? current.phoneNumber,
      alternativePhone: normalizeStr(body.alternativePhone, 40),
      email: normalizeStr(body.email, 200),
      address: normalizeStr(body.address, 500),
      isPrimary: typeof body.isPrimary === 'boolean' ? body.isPrimary : current.isPrimary,
      isNextOfKin: typeof body.isNextOfKin === 'boolean' ? body.isNextOfKin : current.isNextOfKin,
      isBeneficiary: typeof body.isBeneficiary === 'boolean' ? body.isBeneficiary : current.isBeneficiary,
    };
    if (!validatePhone(next.phoneNumber)) return jsonErr(400, 'Phone number must be valid');
    rec.emergencyContacts[idx] = next;
    const err = validateEmergencyContacts(rec.emergencyContacts);
    if (err) return jsonErr(400, err);
    rec.audit.unshift(auditEntry('Updated emergency contact', role));
    return jsonOk(rec.emergencyContacts);
  }

  if (root === 'status') {
    if (!perms.canChangeStatus) return jsonErr(403, 'Permission denied');
    const nextStatus = normalizeStr(body.employmentStatus, 40) as EmployeeStatus | null;
    const allowed: EmployeeStatus[] = ['Active', 'On Leave', 'Probation', 'Confirmed', 'Suspended', 'Resigned', 'Terminated', 'Retired', 'Contract', 'Seconded', 'Field Assignment'];
    if (!nextStatus || !allowed.includes(nextStatus)) return jsonErr(400, 'Invalid employment status');
    const prev = rec.profile.employmentStatus;
    rec.profile.employmentStatus = nextStatus;
    rec.profile.employmentDetails.employmentStatus = nextStatus;
    rec.audit.unshift(auditEntry('Changed status', role, { oldValue: prev, newValue: nextStatus, reason: normalizeStr(body.reason, 240) ?? 'Status change' }));
    rec.history.unshift({ id: `h-${employeeId}-${Math.random().toString(16).slice(2)}`, at: nowIso(), type: 'Status Change', detail: `${prev} → ${nextStatus}`, actor: role });
    return jsonOk({ employmentStatus: nextStatus });
  }

  if (root === 'ai-insights') {
    const next = Array.isArray(body) ? (body as AIInsight[]) : null;
    if (!next) return jsonErr(400, 'Invalid insights payload');
    rec.aiInsights = next.slice(0, 24);
    rec.audit.unshift(auditEntry('Updated AI insights', role));
    return jsonOk(rec.aiInsights);
  }

  return jsonErr(404, 'Not found');
}

export async function POST(request: Request, ctx: { params: Promise<{ id: string; resource: string[] }> }) {
  const { id, resource } = await ctx.params;
  const employeeId = id;
  const role = getRole(request);
  const viewerEmployeeId = getViewerEmployeeId(request);
  if (role === 'Employee' && (!viewerEmployeeId || viewerEmployeeId !== employeeId)) return jsonErr(403, 'Permission denied');
  const perms = rolePermissions(role, employeeId, viewerEmployeeId);
  if (!perms.canViewProfile) return jsonErr(403, 'Permission denied');
  if (!perms.canEdit) return jsonErr(403, 'Permission denied');

  const rec = ensureRecord(employeeId);
  const { root } = getResource(resource);
  const body = (await request.json().catch(() => null)) as any;
  if (!body) return jsonErr(400, 'Invalid JSON body');

  if (root === 'emergency-contacts') {
    const fullName = normalizeStr(body.fullName, 200);
    const relationship = normalizeStr(body.relationship, 120);
    const phoneNumber = normalizeStr(body.phoneNumber, 40);
    if (!fullName || !relationship || !phoneNumber) return jsonErr(400, 'Full name, relationship, and phone number are required');
    if (!validatePhone(phoneNumber)) return jsonErr(400, 'Phone number must be valid');
    const item: EmergencyContact = {
      id: `ec-${employeeId}-${Math.random().toString(16).slice(2)}`,
      fullName,
      relationship,
      phoneNumber,
      alternativePhone: normalizeStr(body.alternativePhone, 40),
      email: normalizeStr(body.email, 200),
      address: normalizeStr(body.address, 500),
      isPrimary: !!body.isPrimary,
      isNextOfKin: !!body.isNextOfKin,
      isBeneficiary: !!body.isBeneficiary,
    };
    const next = [item, ...rec.emergencyContacts];
    const err = validateEmergencyContacts(next);
    if (err) return jsonErr(400, err);
    rec.emergencyContacts = next;
    rec.audit.unshift(auditEntry('Added emergency contact', role));
    return jsonOk(rec.emergencyContacts);
  }

  if (root === 'documents') {
    if (!perms.canViewDocuments) return jsonErr(403, 'Permission denied');
    const category = normalizeStr(body.category, 120);
    const fileName = normalizeStr(body.fileName, 200);
    const mimeType = normalizeStr(body.mimeType, 120);
    const sizeBytes = typeof body.sizeBytes === 'number' && Number.isFinite(body.sizeBytes) ? body.sizeBytes : null;
    if (!category || !fileName || !mimeType || !sizeBytes) return jsonErr(400, 'Invalid document payload');
    if (sizeBytes > 15 * 1024 * 1024) return jsonErr(400, 'File size limit exceeded');
    const allowed = ['application/pdf', 'image/jpeg', 'image/png'];
    if (!allowed.includes(mimeType)) return jsonErr(400, 'File type not allowed');
    const item: DocumentItem = {
      id: `doc-${employeeId}-${Math.random().toString(16).slice(2)}`,
      category,
      fileName,
      mimeType,
      sizeBytes,
      status: 'Uploaded',
      uploadedAt: nowIso(),
      expiresAt: normalizeStr(body.expiresAt, 40),
      verifiedBy: null,
    };
    rec.documents = [item, ...rec.documents];
    rec.audit.unshift(auditEntry('Uploaded document', role));
    return jsonOk(item);
  }

  return jsonErr(404, 'Not found');
}

export async function DELETE(request: Request, ctx: { params: Promise<{ id: string; resource: string[] }> }) {
  const { id, resource } = await ctx.params;
  const employeeId = id;
  const role = getRole(request);
  const viewerEmployeeId = getViewerEmployeeId(request);
  if (role === 'Employee' && (!viewerEmployeeId || viewerEmployeeId !== employeeId)) return jsonErr(403, 'Permission denied');
  const perms = rolePermissions(role, employeeId, viewerEmployeeId);
  if (!perms.canViewProfile) return jsonErr(403, 'Permission denied');
  if (!perms.canEdit) return jsonErr(403, 'Permission denied');

  const rec = ensureRecord(employeeId);
  const { root, rest } = getResource(resource);
  if (root !== 'emergency-contacts') return jsonErr(404, 'Not found');
  const contactId = rest[0];
  if (!contactId) return jsonErr(400, 'Missing contactId');
  const next = rec.emergencyContacts.filter((c) => c.id !== contactId);
  const err = validateEmergencyContacts(next);
  if (err) return jsonErr(400, err);
  rec.emergencyContacts = next;
  rec.audit.unshift(auditEntry('Deleted emergency contact', role));
  return jsonOk({ deleted: true });
}
