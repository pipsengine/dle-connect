import { NextResponse } from 'next/server';

type Role =
  | 'Super Admin'
  | 'HR Director'
  | 'HR Manager'
  | 'HR Officer'
  | 'Department Head'
  | 'Line Manager'
  | 'Payroll Officer'
  | 'Auditor'
  | 'Employee'
  | 'Executive Management';

type ApprovalStatus =
  | 'Draft'
  | 'Submitted'
  | 'Pending HR Review'
  | 'Pending Department Head Approval'
  | 'Pending HR Director Approval'
  | 'Approved'
  | 'Rejected'
  | 'Reversed'
  | 'Cancelled';

type EmploymentEventType =
  | 'Onboarding'
  | 'Confirmation'
  | 'Probation Change'
  | 'Promotion'
  | 'Transfer'
  | 'Department Change'
  | 'Manager Change'
  | 'Job Title Change'
  | 'Grade Change'
  | 'Salary Grade Change'
  | 'Secondment'
  | 'Project Assignment'
  | 'Suspension'
  | 'Contract Renewal'
  | 'Reactivation'
  | 'Resignation'
  | 'Termination'
  | 'Retirement'
  | 'Exit Clearance';

type EmploymentHistoryItem = {
  id: string;
  referenceNo: string;
  employeeId: string;
  employeeName: string;
  businessUnit?: string | null;
  location?: string | null;
  eventType: EmploymentEventType;
  eventDate: string;
  effectiveDate: string;
  previousDepartment?: string | null;
  newDepartment?: string | null;
  previousJobTitle?: string | null;
  newJobTitle?: string | null;
  previousGrade?: string | null;
  newGrade?: string | null;
  previousManager?: string | null;
  newManager?: string | null;
  previousLocation?: string | null;
  newLocation?: string | null;
  previousStatus?: string | null;
  newStatus?: string | null;
  reason: string;
  notes?: string | null;
  approvalStatus: ApprovalStatus;
  approvalId?: string | null;
  approvedBy?: string | null;
  approvedAt?: string | null;
  createdBy: string;
  createdAt: string;
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
    'Department Head',
    'Line Manager',
    'Payroll Officer',
    'Auditor',
    'Employee',
    'Executive Management',
  ];
  return (all.includes(v as Role) ? (v as Role) : 'HR Manager') as Role;
};

const getViewerEmployeeId = (request: Request) => {
  const v = request.headers.get('x-hris-employee-id');
  return v && v.trim() ? v.trim() : undefined;
};

const permissions = (role: Role, viewerEmployeeId: string | undefined) => {
  const canViewAll = role !== 'Employee';
  const canCreate = role === 'Super Admin' || role === 'HR Director' || role === 'HR Manager' || role === 'HR Officer';
  const canApprove = role === 'Super Admin' || role === 'HR Director' || role === 'HR Manager' || role === 'Department Head';
  const canExport = role !== 'Employee';
  const canSeePayrollSignals = role === 'Payroll Officer' || role === 'HR Director' || role === 'HR Manager' || role === 'Executive Management' || role === 'Super Admin';
  const canViewOwn = role === 'Employee' && !!viewerEmployeeId;
  return { canViewAll, canCreate, canApprove, canExport, canSeePayrollSignals, canViewOwn };
};

const store = (() => {
  const g = globalThis as unknown as { __dleHrisEmploymentHistory?: Map<string, EmploymentHistoryItem> };
  if (!g.__dleHrisEmploymentHistory) g.__dleHrisEmploymentHistory = new Map();
  return g.__dleHrisEmploymentHistory;
})();

const createSeeded = (seed: number) => {
  let s = seed >>> 0;
  return () => {
    s = (1664525 * s + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
};

const seedFrom = (v: string) => {
  let h = 2166136261;
  for (let i = 0; i < v.length; i++) {
    h ^= v.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

const pick = <T,>(rng: () => number, arr: T[]) => arr[Math.floor(rng() * arr.length)];
const isoDate = (rng: () => number, y0: number, y1: number) => {
  const y = y0 + Math.floor(rng() * (y1 - y0 + 1));
  const m = String(1 + Math.floor(rng() * 12)).padStart(2, '0');
  const d = String(1 + Math.floor(rng() * 28)).padStart(2, '0');
  return `${y}-${m}-${d}T00:00:00.000Z`;
};

const ensureSeedData = () => {
  if (store.size > 0) return;
  const rng = createSeeded(777);
  const first = ['Juan', 'Amina', 'Chinedu', 'Halima', 'Tunde', 'Ngozi', 'Michael', 'Fatima', 'Ade', 'Rita', 'Samuel', 'Zainab', 'Ibrahim', 'Grace', 'Kehinde', 'Bola', 'Chika', 'Emeka', 'Mary', 'David'];
  const last = ['Dela Cruz', 'Okafor', 'Adeoye', 'Bello', 'Eze', 'Uche', 'Johnson', 'Adebayo', 'Aliyu', 'Okonkwo', 'Ibrahim', 'Mohammed', 'Sule', 'Okoro', 'Nwankwo', 'Garcia', 'Torres', 'Mendoza', 'Valdez', 'Reyes'];
  const departments = ['Civil Engineering', 'Mechanical Engineering', 'Electrical & Instrumentation', 'Project Controls', 'HSE', 'Quality Assurance', 'Procurement', 'Finance', 'Human Capital', 'IT & Support', 'Legal & Compliance', 'Executive Office'];
  const businessUnits = ['Operations', 'Corporate Services', 'Projects', 'Commercial'];
  const locations = ['Lagos HQ', 'Port Harcourt', 'Warri Yard', 'Bonny Island', 'Remote'];
  const jobTitles = ['Senior Civil Engineer', 'Mechanical Supervisor', 'E&I Technician', 'Project Manager', 'Planning Engineer', 'Quantity Surveyor', 'HSE Officer', 'QA/QC Engineer', 'HR Officer', 'Payroll Specialist', 'IT Support Engineer', 'Legal Counsel', 'Executive Assistant'];
  const grades = ['G7', 'G8', 'G9', 'G10', 'G11', 'G12'];
  const managers = first.map((f) => `${f} ${pick(rng, last)}`);
  const statuses = ['Active', 'On Leave', 'Probation', 'Confirmed', 'Suspended', 'Resigned', 'Terminated', 'Retired', 'Contract'];
  const types: EmploymentEventType[] = [
    'Onboarding',
    'Confirmation',
    'Probation Change',
    'Promotion',
    'Transfer',
    'Department Change',
    'Manager Change',
    'Job Title Change',
    'Grade Change',
    'Contract Renewal',
    'Suspension',
    'Reactivation',
    'Resignation',
    'Termination',
    'Retirement',
  ];
  const approvalStatuses: ApprovalStatus[] = [
    'Approved',
    'Approved',
    'Approved',
    'Submitted',
    'Pending HR Review',
    'Rejected',
    'Draft',
    'Reversed',
  ];

  const buForDepartment = (dep: string) => {
    if (['Civil Engineering', 'Mechanical Engineering', 'Electrical & Instrumentation', 'Project Controls', 'HSE', 'Quality Assurance'].includes(dep)) return 'Projects';
    if (['Procurement', 'Finance', 'Human Capital', 'IT & Support', 'Legal & Compliance'].includes(dep)) return 'Corporate Services';
    if (dep === 'Executive Office') return 'Commercial';
    return pick(rng, businessUnits);
  };

  const now = new Date('2026-05-01T00:00:00.000Z').getTime();
  for (let i = 0; i < 260; i++) {
    const employeeId = `DLE-EMP-${String(1 + Math.floor(rng() * 180)).padStart(5, '0')}`;
    const employeeName = `${pick(rng, first)} ${pick(rng, last)}`;
    const eventType = pick(rng, types);
    const effective = new Date(now - Math.floor(rng() * 420) * 24 * 3600 * 1000).toISOString();
    const eventDate = new Date(new Date(effective).getTime() - Math.floor(rng() * 10) * 24 * 3600 * 1000).toISOString();
    const prevDept = pick(rng, departments);
    const nextDept = pick(rng, departments);
    const prevBu = buForDepartment(prevDept);
    const nextBu = buForDepartment(nextDept);
    const prevLoc = pick(rng, locations);
    const nextLoc = pick(rng, locations);
    const prevTitle = pick(rng, jobTitles);
    const nextTitle = pick(rng, jobTitles);
    const prevGrade = pick(rng, grades);
    const nextGrade = pick(rng, grades);
    const prevMgr = pick(rng, managers);
    const nextMgr = pick(rng, managers);
    const prevStatus = pick(rng, statuses);
    const nextStatus = pick(rng, statuses);
    const approvalStatus = pick(rng, approvalStatuses);
    const id = `hist-${seedFrom(`${employeeId}:${i}`).toString(16)}`;
    const referenceNo = `HIST-${String(100000 + i)}`;

    store.set(id, {
      id,
      referenceNo,
      employeeId,
      employeeName,
      businessUnit: eventType === 'Transfer' || eventType === 'Department Change' ? nextBu : prevBu,
      location: eventType === 'Transfer' || eventType === 'Department Change' ? nextLoc : prevLoc,
      eventType,
      eventDate,
      effectiveDate: effective,
      previousDepartment: eventType === 'Transfer' || eventType === 'Department Change' ? prevDept : null,
      newDepartment: eventType === 'Transfer' || eventType === 'Department Change' ? nextDept : null,
      previousJobTitle: eventType === 'Promotion' || eventType === 'Job Title Change' ? prevTitle : null,
      newJobTitle: eventType === 'Promotion' || eventType === 'Job Title Change' ? nextTitle : null,
      previousGrade: eventType === 'Promotion' || eventType === 'Grade Change' ? prevGrade : null,
      newGrade: eventType === 'Promotion' || eventType === 'Grade Change' ? nextGrade : null,
      previousManager: eventType === 'Manager Change' ? prevMgr : null,
      newManager: eventType === 'Manager Change' ? nextMgr : null,
      previousLocation: eventType === 'Transfer' ? prevLoc : null,
      newLocation: eventType === 'Transfer' ? nextLoc : null,
      previousStatus: eventType === 'Suspension' || eventType === 'Reactivation' ? prevStatus : null,
      newStatus: eventType === 'Suspension' || eventType === 'Reactivation' ? nextStatus : null,
      reason: `${eventType} recorded for compliance traceability.`,
      notes: rng() < 0.4 ? 'Supporting document recorded in HRIS.' : null,
      approvalStatus,
      approvalId: approvalStatus === 'Approved' ? `APP-${String(80000 + Math.floor(rng() * 18000))}` : null,
      approvedBy: approvalStatus === 'Approved' ? pick(rng, ['HR Manager', 'HR Director', 'Department Head']) : null,
      approvedAt: approvalStatus === 'Approved' ? eventDate : null,
      createdBy: pick(rng, ['HR Officer', 'HR Manager', 'System']),
      createdAt: eventDate,
    });
  }
};

const parseCsv = (v: string | null) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : []);

export async function GET(request: Request) {
  ensureSeedData();
  const role = getRole(request);
  const viewerEmployeeId = getViewerEmployeeId(request);
  const perms = permissions(role, viewerEmployeeId);
  const url = new URL(request.url);

  const q = (url.searchParams.get('q') || '').trim().toLowerCase();
  const employeeId = (url.searchParams.get('employeeId') || '').trim();
  const eventTypes = parseCsv(url.searchParams.get('eventType'));
  const departments = parseCsv(url.searchParams.get('department'));
  const businessUnits = parseCsv(url.searchParams.get('businessUnit'));
  const locations = parseCsv(url.searchParams.get('location'));
  const employeeStatuses = parseCsv(url.searchParams.get('employeeStatus'));
  const createdBys = parseCsv(url.searchParams.get('createdBy'));
  const managers = parseCsv(url.searchParams.get('manager'));
  const jobTitles = parseCsv(url.searchParams.get('jobTitle'));
  const prevGrades = parseCsv(url.searchParams.get('previousJobGrade'));
  const newGrades = parseCsv(url.searchParams.get('newJobGrade'));
  const prevDepts = parseCsv(url.searchParams.get('previousDepartment'));
  const newDepts = parseCsv(url.searchParams.get('newDepartment'));
  const approvalStatuses = parseCsv(url.searchParams.get('approvalStatus'));
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const limit = Math.max(1, Math.min(500, Number(url.searchParams.get('limit') || '200')));

  const fromMs = from ? new Date(`${from}T00:00:00.000Z`).getTime() : null;
  const toMs = to ? new Date(`${to}T23:59:59.999Z`).getTime() : null;

  let rows = Array.from(store.values());

  if (!perms.canViewAll) {
    if (!perms.canViewOwn) return jsonErr(403, 'Permission denied');
    rows = rows.filter((r) => r.employeeId === viewerEmployeeId && r.approvalStatus === 'Approved');
  }

  if (employeeId) rows = rows.filter((r) => r.employeeId === employeeId);
  if (eventTypes.length) rows = rows.filter((r) => eventTypes.includes(r.eventType));
  if (approvalStatuses.length) rows = rows.filter((r) => approvalStatuses.includes(r.approvalStatus));
  if (departments.length) rows = rows.filter((r) => departments.includes((r.newDepartment || r.previousDepartment || '').toString()));
  if (businessUnits.length) rows = rows.filter((r) => businessUnits.includes((r.businessUnit || '').toString()));
  if (locations.length) rows = rows.filter((r) => locations.includes((r.location || r.newLocation || r.previousLocation || '').toString()));
  if (createdBys.length) rows = rows.filter((r) => createdBys.includes((r.createdBy || '').toString()));
  if (managers.length)
    rows = rows.filter((r) => {
      const m = (r.newManager || r.previousManager || '').toString();
      return managers.includes(m);
    });
  if (jobTitles.length)
    rows = rows.filter((r) => {
      const jt = (r.newJobTitle || r.previousJobTitle || '').toString();
      return jobTitles.includes(jt);
    });
  if (prevGrades.length) rows = rows.filter((r) => prevGrades.includes((r.previousGrade || '').toString()));
  if (newGrades.length) rows = rows.filter((r) => newGrades.includes((r.newGrade || '').toString()));
  if (prevDepts.length) rows = rows.filter((r) => prevDepts.includes((r.previousDepartment || '').toString()));
  if (newDepts.length) rows = rows.filter((r) => newDepts.includes((r.newDepartment || '').toString()));
  if (employeeStatuses.length)
    rows = rows.filter((r) => {
      const s = (r.newStatus || r.previousStatus || 'Active').toString();
      return employeeStatuses.includes(s);
    });

  if (fromMs !== null) rows = rows.filter((r) => new Date(r.effectiveDate).getTime() >= fromMs);
  if (toMs !== null) rows = rows.filter((r) => new Date(r.effectiveDate).getTime() <= toMs);

  if (q) {
    rows = rows.filter((r) => {
      return (
        r.employeeId.toLowerCase().includes(q) ||
        r.employeeName.toLowerCase().includes(q) ||
        r.eventType.toLowerCase().includes(q) ||
        r.referenceNo.toLowerCase().includes(q) ||
        (r.approvalId || '').toLowerCase().includes(q) ||
        (r.createdBy || '').toLowerCase().includes(q) ||
        (r.businessUnit || '').toLowerCase().includes(q) ||
        (r.location || '').toLowerCase().includes(q) ||
        (r.previousDepartment || '').toLowerCase().includes(q) ||
        (r.newDepartment || '').toLowerCase().includes(q) ||
        (r.previousJobTitle || '').toLowerCase().includes(q) ||
        (r.newJobTitle || '').toLowerCase().includes(q) ||
        (r.previousGrade || '').toLowerCase().includes(q) ||
        (r.newGrade || '').toLowerCase().includes(q) ||
        (r.previousManager || '').toLowerCase().includes(q) ||
        (r.newManager || '').toLowerCase().includes(q)
      );
    });
  }

  rows.sort((a, b) => (a.effectiveDate < b.effectiveDate ? 1 : -1));
  rows = rows.slice(0, limit);

  return jsonOk({ items: rows, total: rows.length, permissions: { ...perms, canCreate: perms.canViewAll && perms.canCreate, canApprove: perms.canViewAll && perms.canApprove, canExport: perms.canExport } });
}
