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

type Severity = 'high' | 'medium' | 'low';

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
  supportingDocument?: { id: string; name: string } | null;
  approvalStatus: ApprovalStatus;
  approvalId?: string | null;
  approvedBy?: string | null;
  approvedAt?: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt?: string | null;
  audit: AuditLog[];
  reverseOf?: string | null;
};

type AuditLog = {
  id: string;
  at: string;
  action: string;
  performedBy: string;
  ipAddress?: string | null;
  device?: string | null;
  oldValue?: string | null;
  newValue?: string | null;
  reason?: string | null;
};

type AIInsight = { id: string; severity: Severity; confidence: number; title: string; recommendation: string; actionLabel: string; action: string };

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
  const canAnalytics = role === 'Super Admin' || role === 'HR Director' || role === 'HR Manager' || role === 'Executive Management';
  const canSeePayrollSignals = role === 'Payroll Officer' || role === 'HR Director' || role === 'HR Manager' || role === 'Executive Management' || role === 'Super Admin';
  const canViewOwn = role === 'Employee' && !!viewerEmployeeId;
  return { canViewAll, canCreate, canApprove, canExport, canAnalytics, canSeePayrollSignals, canViewOwn };
};

const historyStore = (() => {
  const g = globalThis as unknown as { __dleHrisEmploymentHistoryDetail?: Map<string, EmploymentHistoryItem> };
  if (!g.__dleHrisEmploymentHistoryDetail) g.__dleHrisEmploymentHistoryDetail = new Map();
  return g.__dleHrisEmploymentHistoryDetail;
})();

const listStore = (() => {
  const g = globalThis as unknown as { __dleHrisEmploymentHistory?: Map<string, any> };
  if (!g.__dleHrisEmploymentHistory) g.__dleHrisEmploymentHistory = new Map();
  return g.__dleHrisEmploymentHistory;
})();

const isSeededHistoryItem = (item: Partial<EmploymentHistoryItem> | any) =>
  typeof item?.referenceNo === 'string' &&
  /^HIST-10\d{4}$/.test(item.referenceNo) &&
  typeof item?.reason === 'string' &&
  item.reason.endsWith('recorded for compliance traceability.');

const removeSeededHistoryData = () => {
  for (const [id, item] of Array.from(historyStore.entries())) {
    if (isSeededHistoryItem(item)) historyStore.delete(id);
  }
  for (const [id, item] of Array.from(listStore.entries())) {
    if (isSeededHistoryItem(item)) listStore.delete(id);
  }
};

const overridesStore = (() => {
  const g = globalThis as unknown as { __dleHrisEmployeeOverrides?: Map<string, any> };
  if (!g.__dleHrisEmployeeOverrides) g.__dleHrisEmployeeOverrides = new Map();
  return g.__dleHrisEmployeeOverrides;
})();

const nowIso = () => new Date().toISOString();
const audit = (evt: EmploymentHistoryItem, performedBy: string, action: string, extra?: Partial<AuditLog>) => {
  evt.audit.unshift({
    id: `aud-${Math.random().toString(16).slice(2)}`,
    at: nowIso(),
    action,
    performedBy,
    ipAddress: '10.0.12.44',
    device: 'DLE-HRIS-Web',
    ...extra,
  });
};

const normalize = (v: unknown, max = 500) => {
  if (typeof v !== 'string') return '';
  const t = v.trim();
  return t.length > max ? t.slice(0, max) : t;
};

const assertNonEmpty = (val: string, msg: string) => {
  if (!val) throw new Error(msg);
};

const validateEvent = (evt: Partial<EmploymentHistoryItem>, ctx: { role: Role }) => {
  assertNonEmpty(normalize(evt.employeeId), 'Employee is required');
  assertNonEmpty(normalize(evt.employeeName), 'Employee name is required');
  assertNonEmpty(normalize(evt.eventType), 'Event type is required');
  assertNonEmpty(normalize(evt.effectiveDate), 'Effective date is required');
  assertNonEmpty(normalize(evt.reason), 'Reason is required');

  const eff = new Date(normalize(evt.effectiveDate)).getTime();
  if (!Number.isFinite(eff)) throw new Error('Effective date is invalid');

  const allowBackdate = ctx.role === 'Super Admin' || ctx.role === 'HR Director';
  const backDays = Math.floor((Date.now() - eff) / (24 * 3600 * 1000));
  if (backDays > 30 && !allowBackdate) throw new Error('Backdated events (>30 days) require HR Director or Super Admin permission');

  if (evt.eventType === 'Transfer' || evt.eventType === 'Department Change') {
    const prev = normalize(evt.previousDepartment);
    const next = normalize(evt.newDepartment);
    assertNonEmpty(prev, 'Previous department is required');
    assertNonEmpty(next, 'New department is required');
    if (prev && next && prev === next) throw new Error('New department cannot equal previous department');
  }

  if (evt.eventType === 'Promotion' || evt.eventType === 'Grade Change') {
    const prev = normalize(evt.previousGrade);
    const next = normalize(evt.newGrade);
    assertNonEmpty(prev, 'Previous grade is required');
    assertNonEmpty(next, 'New grade is required');
    if (prev && next && prev === next) throw new Error('New grade cannot equal previous grade');
  }

  if (evt.eventType === 'Manager Change') {
    const prev = normalize(evt.previousManager);
    const next = normalize(evt.newManager);
    assertNonEmpty(prev, 'Previous manager is required');
    assertNonEmpty(next, 'New manager is required');
    if (normalize(evt.employeeName) && next && normalize(evt.employeeName).toLowerCase() === next.toLowerCase()) throw new Error('Manager cannot be the same as employee');
  }

  const prevStatus = normalize(evt.previousStatus);
  if (prevStatus && prevStatus.toLowerCase() === 'suspended' && (evt.eventType === 'Transfer' || evt.eventType === 'Department Change' || evt.eventType === 'Promotion' || evt.eventType === 'Grade Change')) {
    throw new Error('Suspended employee cannot be moved or promoted without reactivation');
  }
  if (prevStatus && ['resigned', 'terminated', 'retired'].includes(prevStatus.toLowerCase()) && (evt.eventType === 'Promotion' || evt.eventType === 'Grade Change' || evt.eventType === 'Transfer' || evt.eventType === 'Department Change')) {
    throw new Error('Exited employee cannot receive movement or promotion events');
  }
  if (evt.eventType === 'Reactivation' && prevStatus && ['active', 'confirmed', 'probation', 'on leave', 'contract'].includes(prevStatus.toLowerCase())) {
    throw new Error('Reactivation requires an inactive previous status');
  }
};

type OverrideLedgerEntry = {
  historyId: string;
  at: string;
  patch: Record<string, string | null>;
  previous: Record<string, string | null | undefined>;
};

const businessUnitForDepartment = (dep: string) => {
  if (['Civil Engineering', 'Mechanical Engineering', 'Electrical & Instrumentation', 'Project Controls', 'HSE', 'Quality Assurance'].includes(dep)) return 'Projects';
  if (['Procurement', 'Finance', 'Human Capital', 'IT & Support', 'Legal & Compliance'].includes(dep)) return 'Corporate Services';
  if (dep === 'Executive Office') return 'Commercial';
  return 'Operations';
};

const updateOverrideFromApprovedEvent = (evt: EmploymentHistoryItem) => {
  const employeeId = evt.employeeId;
  const existing = overridesStore.get(employeeId) || {};
  const next = { ...existing };
  next.profile = next.profile && typeof next.profile === 'object' ? { ...next.profile } : {};
  next.profile.jobDetails = next.profile.jobDetails && typeof next.profile.jobDetails === 'object' ? { ...next.profile.jobDetails } : {};
  next.profile.employmentDetails = next.profile.employmentDetails && typeof next.profile.employmentDetails === 'object' ? { ...next.profile.employmentDetails } : {};

  const currentDepartment = (next.profile.department ?? next.profile.jobDetails.department) as string | undefined;
  const currentJobTitle = (next.profile.jobTitle ?? next.profile.jobDetails.jobTitle) as string | undefined;
  const currentJobGrade = next.profile.jobDetails.jobGrade as string | undefined;
  const currentManager = (next.profile.reportingManager ?? next.profile.jobDetails.reportingManager) as string | undefined;
  const currentStatus = (next.profile.employmentStatus ?? next.profile.employmentDetails.employmentStatus) as string | undefined;

  const patch: Record<string, string | null> = {};
  const previous: Record<string, string | null | undefined> = {};

  if (evt.eventType === 'Transfer' || evt.eventType === 'Department Change') {
    if (evt.newDepartment) {
      previous.department = currentDepartment;
      patch.department = evt.newDepartment;
      next.profile.department = evt.newDepartment;
      next.profile.jobDetails.department = evt.newDepartment;
      const bu = businessUnitForDepartment(evt.newDepartment);
      previous.businessUnit = (next.profile.businessUnit ?? next.profile.jobDetails.businessUnit) as string | undefined;
      patch.businessUnit = bu;
      next.profile.businessUnit = bu;
      next.profile.jobDetails.businessUnit = bu;
    }
  }
  if (evt.eventType === 'Job Title Change' || evt.eventType === 'Promotion') {
    if (evt.newJobTitle) {
      previous.jobTitle = currentJobTitle;
      patch.jobTitle = evt.newJobTitle;
      next.profile.jobTitle = evt.newJobTitle;
      next.profile.jobDetails.jobTitle = evt.newJobTitle;
    }
  }
  if (evt.eventType === 'Promotion' || evt.eventType === 'Grade Change') {
    if (evt.newGrade) {
      previous.jobGrade = currentJobGrade;
      patch.jobGrade = evt.newGrade;
      next.profile.jobDetails.jobGrade = evt.newGrade;
    }
  }
  if (evt.eventType === 'Manager Change') {
    if (evt.newManager) {
      previous.reportingManager = currentManager;
      patch.reportingManager = evt.newManager;
      next.profile.reportingManager = evt.newManager;
      next.profile.jobDetails.reportingManager = evt.newManager;
    }
  }
  if (evt.eventType === 'Suspension' || evt.eventType === 'Reactivation' || evt.eventType === 'Resignation' || evt.eventType === 'Termination' || evt.eventType === 'Retirement') {
    if (evt.newStatus) {
      previous.employmentStatus = currentStatus;
      patch.employmentStatus = evt.newStatus;
      next.profile.employmentStatus = evt.newStatus;
      next.profile.employmentDetails.employmentStatus = evt.newStatus;
    }
  }
  if (evt.eventType === 'Transfer') {
    if (evt.newLocation) {
      previous.location = (next.profile.location ?? next.profile.jobDetails.location) as string | undefined;
      patch.location = evt.newLocation;
      next.profile.location = evt.newLocation;
      next.profile.jobDetails.location = evt.newLocation;
    }
  }

  const histEvent = {
    id: `h-${employeeId}-${Math.random().toString(16).slice(2)}`,
    sourceHistoryId: evt.id,
    at: evt.effectiveDate,
    type: evt.eventType,
    detail: evt.reason,
    actor: evt.approvedBy || 'HRIS',
  };
  next.history = Array.isArray(next.history) ? [histEvent, ...next.history] : [histEvent];

  const ledgerEntry: OverrideLedgerEntry = { historyId: evt.id, at: nowIso(), patch, previous };
  next.ledger = Array.isArray(next.ledger) ? [ledgerEntry, ...next.ledger] : [ledgerEntry];

  overridesStore.set(employeeId, next);
};

const reverseOverrideForEvent = (employeeId: string, historyId: string) => {
  const ov = overridesStore.get(employeeId);
  if (!ov || typeof ov !== 'object') return;
  const ledger: OverrideLedgerEntry[] = Array.isArray((ov as any).ledger) ? (ov as any).ledger : [];
  const entry = ledger.find((l) => l && l.historyId === historyId);
  if (!entry) return;

  const next = { ...(ov as any) };
  next.profile = next.profile && typeof next.profile === 'object' ? { ...next.profile } : {};
  next.profile.jobDetails = next.profile.jobDetails && typeof next.profile.jobDetails === 'object' ? { ...next.profile.jobDetails } : {};
  next.profile.employmentDetails = next.profile.employmentDetails && typeof next.profile.employmentDetails === 'object' ? { ...next.profile.employmentDetails } : {};

  const restore = (k: string, v: string | null | undefined) => {
    const del = v === undefined;
    if (k === 'department') {
      if (del) {
        delete next.profile.department;
        delete next.profile.jobDetails.department;
      } else {
        next.profile.department = v;
        next.profile.jobDetails.department = v;
      }
      return;
    }
    if (k === 'businessUnit') {
      if (del) {
        delete next.profile.businessUnit;
        delete next.profile.jobDetails.businessUnit;
      } else {
        next.profile.businessUnit = v;
        next.profile.jobDetails.businessUnit = v;
      }
      return;
    }
    if (k === 'jobTitle') {
      if (del) {
        delete next.profile.jobTitle;
        delete next.profile.jobDetails.jobTitle;
      } else {
        next.profile.jobTitle = v;
        next.profile.jobDetails.jobTitle = v;
      }
      return;
    }
    if (k === 'jobGrade') {
      if (del) delete next.profile.jobDetails.jobGrade;
      else next.profile.jobDetails.jobGrade = v;
      return;
    }
    if (k === 'reportingManager') {
      if (del) {
        delete next.profile.reportingManager;
        delete next.profile.jobDetails.reportingManager;
      } else {
        next.profile.reportingManager = v;
        next.profile.jobDetails.reportingManager = v;
      }
      return;
    }
    if (k === 'employmentStatus') {
      if (del) {
        delete next.profile.employmentStatus;
        delete next.profile.employmentDetails.employmentStatus;
      } else {
        next.profile.employmentStatus = v;
        next.profile.employmentDetails.employmentStatus = v;
      }
      return;
    }
    if (k === 'location') {
      if (del) {
        delete next.profile.location;
        delete next.profile.jobDetails.location;
      } else {
        next.profile.location = v;
        next.profile.jobDetails.location = v;
      }
    }
  };

  for (const [k] of Object.entries(entry.patch || {})) {
    restore(k, entry.previous ? entry.previous[k] : undefined);
  }

  next.ledger = ledger.filter((l) => l && l.historyId !== historyId);
  if (Array.isArray(next.history)) next.history = next.history.filter((h: any) => h && h.sourceHistoryId !== historyId);
  overridesStore.set(employeeId, next);
};

const toListItem = (evt: EmploymentHistoryItem) => {
  const dep = (evt.newDepartment || evt.previousDepartment || '') as string;
  const businessUnit = dep ? businessUnitForDepartment(dep) : null;
  const location = (evt.newLocation || evt.previousLocation || evt.location || null) as string | null;
  return {
    id: evt.id,
    referenceNo: evt.referenceNo,
    employeeId: evt.employeeId,
    employeeName: evt.employeeName,
    businessUnit: evt.businessUnit ?? businessUnit,
    location: evt.location ?? location,
    eventType: evt.eventType,
    eventDate: evt.eventDate,
    effectiveDate: evt.effectiveDate,
    previousDepartment: evt.previousDepartment ?? null,
    newDepartment: evt.newDepartment ?? null,
    previousJobTitle: evt.previousJobTitle ?? null,
    newJobTitle: evt.newJobTitle ?? null,
    previousGrade: evt.previousGrade ?? null,
    newGrade: evt.newGrade ?? null,
    previousManager: evt.previousManager ?? null,
    newManager: evt.newManager ?? null,
    previousLocation: evt.previousLocation ?? null,
    newLocation: evt.newLocation ?? null,
    previousStatus: evt.previousStatus ?? null,
    newStatus: evt.newStatus ?? null,
    reason: evt.reason,
    notes: evt.notes ?? null,
    approvalStatus: evt.approvalStatus,
    approvalId: evt.approvalId ?? null,
    approvedBy: evt.approvedBy ?? null,
    approvedAt: evt.approvedAt ?? null,
    createdBy: evt.createdBy,
    createdAt: evt.createdAt,
  };
};

const ensureSeedFromListStore = () => {
  removeSeededHistoryData();
  if (process.env.HRIS_ENABLE_DEMO_EMPLOYMENT_HISTORY !== 'true') return;
  if (historyStore.size > 0) return;
  for (const r of Array.from(listStore.values()).slice(0, 260)) {
    if (r && r.id && !historyStore.has(r.id)) {
      historyStore.set(r.id, {
        ...r,
        updatedAt: null,
        audit: [
          {
            id: `aud-${Math.random().toString(16).slice(2)}`,
            at: r.createdAt,
            action: 'History event created',
            performedBy: r.createdBy || 'System',
            ipAddress: '10.0.12.44',
            device: 'DLE-HRIS-Web',
          },
        ],
        supportingDocument: null,
        reverseOf: null,
      });
    }
  }
};

const summary = (items: EmploymentHistoryItem[]) => {
  const count = (t: EmploymentEventType) => items.filter((i) => i.eventType === t).length;
  const approval = (s: ApprovalStatus) => items.filter((i) => i.approvalStatus === s).length;
  const month = new Date().toISOString().slice(0, 7);
  const currentMonthChanges = items.filter((i) => i.effectiveDate.slice(0, 7) === month).length;
  return {
    total: items.length,
    promotions: count('Promotion'),
    transfers: count('Transfer'),
    confirmations: count('Confirmation'),
    contractRenewals: count('Contract Renewal'),
    suspensions: count('Suspension'),
    exits: items.filter((i) => ['Resignation', 'Termination', 'Retirement', 'Exit Clearance'].includes(i.eventType)).length,
    reactivations: count('Reactivation'),
    pendingApprovals: approval('Submitted') + approval('Pending HR Review') + approval('Pending Department Head Approval') + approval('Pending HR Director Approval'),
    currentMonthChanges,
  };
};

const aiInsights = (items: EmploymentHistoryItem[], canSeePayrollSignals: boolean): AIInsight[] => {
  if (items.length === 0) return [];
  const overdueConfirmations = items.filter((i) => i.eventType === 'Probation Change' && i.approvalStatus !== 'Approved').length;
  const transfersWithoutManager = items.filter((i) => i.eventType === 'Transfer' && (!i.newManager || i.newManager === '—')).length;
  const gradeChangesNoApproval = items.filter((i) => (i.eventType === 'Grade Change' || i.eventType === 'Promotion') && !i.approvalId && i.approvalStatus === 'Approved').length;
  const contractRenewalsMissingDoc = items.filter((i) => i.eventType === 'Contract Renewal' && !i.supportingDocument).length;

  const base: AIInsight[] = [
    { id: 'ai-1', severity: 'medium', confidence: 0.86, title: `${overdueConfirmations} employees have overdue confirmation history updates`, recommendation: 'Review probation/confirmation events and submit for approval.', actionLabel: 'Open records', action: 'filter:confirmation' },
    { id: 'ai-2', severity: 'high', confidence: 0.88, title: `${transfersWithoutManager} transfers were completed without updated reporting managers`, recommendation: 'Validate manager assignments for all transfers and update reporting lines.', actionLabel: 'Open transfers', action: 'filter:transfer-manager' },
    { id: 'ai-3', severity: 'medium', confidence: 0.82, title: `${gradeChangesNoApproval} grade changes were approved without approval IDs`, recommendation: 'Backfill approval references or reconcile workflow records.', actionLabel: 'Open grade changes', action: 'filter:grade-approval' },
    { id: 'ai-4', severity: 'medium', confidence: 0.79, title: `${contractRenewalsMissingDoc} contract renewals are missing signed documents`, recommendation: 'Upload signed renewal agreements and verify document status.', actionLabel: 'Open renewals', action: 'filter:renewal-docs' },
    { id: 'ai-5', severity: 'low', confidence: 0.73, title: 'High transfer activity detected in Operations Department', recommendation: 'Review movement trend and validate reasons against workforce plan.', actionLabel: 'Open analytics', action: 'open:analytics' },
  ];

  if (canSeePayrollSignals) {
    const exitedWithoutApproval = items.filter((i) => ['Resignation', 'Termination', 'Retirement', 'Exit Clearance'].includes(i.eventType) && i.approvalStatus !== 'Approved').length;
    if (exitedWithoutApproval > 0) {
      base.push({ id: 'ai-6', severity: 'high', confidence: 0.9, title: `${exitedWithoutApproval} exit events still need approval`, recommendation: 'Complete exit approvals before payroll closure or final settlement.', actionLabel: 'Open exits', action: 'filter:exit-payroll' });
    }
  }
  return base.filter((item) => !item.title.startsWith('0 ') && item.id !== 'ai-5');
};

const parseCsv = (v: string | null) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : []);

const exportCsv = (items: EmploymentHistoryItem[]) => {
  const header = [
    'reference_no',
    'employee_id',
    'employee_name',
    'event_type',
    'previous_department',
    'new_department',
    'previous_job_title',
    'new_job_title',
    'previous_grade',
    'new_grade',
    'effective_date',
    'approval_status',
    'approved_by',
    'created_by',
    'created_at',
  ];
  const esc = (s: unknown) => {
    const v = typeof s === 'string' ? s : s === null || s === undefined ? '' : String(s);
    if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
    return v;
  };
  const lines = [header.join(',')];
  for (const i of items) {
    lines.push(
      [
        i.referenceNo,
        i.employeeId,
        i.employeeName,
        i.eventType,
        i.previousDepartment || '',
        i.newDepartment || '',
        i.previousJobTitle || '',
        i.newJobTitle || '',
        i.previousGrade || '',
        i.newGrade || '',
        i.effectiveDate,
        i.approvalStatus,
        i.approvedBy || '',
        i.createdBy,
        i.createdAt,
      ]
        .map(esc)
        .join(',')
    );
  }
  return lines.join('\n');
};

const exportXls = (items: EmploymentHistoryItem[]) => {
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v);
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  };
  const rows = [
    ['Reference No.', 'Employee ID', 'Employee Name', 'Event Type', 'Prev Dept', 'New Dept', 'Prev Title', 'New Title', 'Prev Grade', 'New Grade', 'Effective Date', 'Approval Status', 'Approved By', 'Created By', 'Created At'],
    ...items.map((i) => [
      i.referenceNo,
      i.employeeId,
      i.employeeName,
      i.eventType,
      i.previousDepartment || '',
      i.newDepartment || '',
      i.previousJobTitle || '',
      i.newJobTitle || '',
      i.previousGrade || '',
      i.newGrade || '',
      i.effectiveDate,
      i.approvalStatus,
      i.approvedBy || '',
      i.createdBy,
      i.createdAt,
    ]),
  ];
  return `<!doctype html><html><head><meta charset="utf-8"></head><body><table border="1">${rows
    .map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`)
    .join('')}</table></body></html>`;
};

const buildPdf = (title: string, lines: string[]) => {
  const escapePdf = (s: string) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  const clean = (s: string) => escapePdf(s.replace(/\r?\n/g, ' ').slice(0, 160));
  const fontSize = 10;
  const lineHeight = 12;
  const startY = 760;
  const x = 40;

  const all = [title, ...lines].slice(0, 55);
  const streamParts: string[] = [];
  streamParts.push(`BT /F1 ${fontSize} Tf ${x} ${startY} Td`);
  for (let i = 0; i < all.length; i++) {
    const line = clean(all[i] || '');
    streamParts.push(`(${line}) Tj`);
    if (i !== all.length - 1) streamParts.push(`0 -${lineHeight} Td`);
  }
  streamParts.push('ET');
  const stream = streamParts.join('\n');

  const encoder = new TextEncoder();
  const objs: string[] = [];
  objs.push('%PDF-1.4\n');
  const xref: number[] = [0];
  const pushObj = (s: string) => {
    xref.push(objs.join('').length);
    objs.push(s);
  };

  pushObj('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  pushObj('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');
  pushObj('3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n');
  pushObj('4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n');

  const streamBytes = encoder.encode(stream);
  pushObj(`5 0 obj\n<< /Length ${streamBytes.length} >>\nstream\n${stream}\nendstream\nendobj\n`);

  const startXref = objs.join('').length;
  const count = xref.length;
  let xrefTable = `xref\n0 ${count}\n0000000000 65535 f \n`;
  for (let i = 1; i < count; i++) {
    xrefTable += `${String(xref[i]).padStart(10, '0')} 00000 n \n`;
  }
  const trailer = `trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${startXref}\n%%EOF\n`;
  const full = objs.join('') + xrefTable + trailer;
  return encoder.encode(full);
};

const findVisibleItems = (role: Role, viewerEmployeeId: string | undefined) => {
  ensureSeedFromListStore();
  const perms = permissions(role, viewerEmployeeId);
  let items = Array.from(historyStore.values());
  if (!perms.canViewAll) {
    if (!perms.canViewOwn) throw new Error('Permission denied');
    items = items.filter((i) => i.employeeId === viewerEmployeeId && i.approvalStatus === 'Approved');
  }
  items.sort((a, b) => (a.effectiveDate < b.effectiveDate ? 1 : -1));
  return items;
};

export async function GET(request: Request, ctx: { params: Promise<{ action: string[] }> }) {
  const role = getRole(request);
  const viewerEmployeeId = getViewerEmployeeId(request);
  const perms = permissions(role, viewerEmployeeId);
  const { action } = await ctx.params;
  const seg0 = action[0] || '';

  try {
    if (seg0 === 'summary') return jsonOk(summary(findVisibleItems(role, viewerEmployeeId)));
    if (seg0 === 'analytics') {
      if (!perms.canAnalytics) return jsonErr(403, 'Permission denied');
      const items = findVisibleItems(role, viewerEmployeeId);
      const byEventType: Record<string, number> = {};
      const byDepartment: Record<string, number> = {};
      for (const i of items) {
        byEventType[i.eventType] = (byEventType[i.eventType] || 0) + 1;
        const dep = (i.newDepartment || i.previousDepartment || '—') as string;
        byDepartment[dep] = (byDepartment[dep] || 0) + 1;
      }
      return jsonOk({ byEventType, byDepartment, lastUpdatedAt: nowIso() });
    }
    if (seg0 === 'ai-insights') {
      const items = findVisibleItems(role, viewerEmployeeId);
      return jsonOk(aiInsights(items, perms.canSeePayrollSignals));
    }
    if (seg0 === 'export') {
      if (!perms.canExport) return jsonErr(403, 'Permission denied');
      const url = new URL(request.url);
      const fmt = normalize(url.searchParams.get('format')) || 'csv';
      const q = normalize(url.searchParams.get('q')).toLowerCase();
      const employeeId = normalize(url.searchParams.get('employeeId'));
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
      const from = normalize(url.searchParams.get('from'));
      const to = normalize(url.searchParams.get('to'));
      let items = findVisibleItems(role, viewerEmployeeId);
      if (employeeId) items = items.filter((i) => i.employeeId === employeeId);

      const fromMs = from ? new Date(`${from}T00:00:00.000Z`).getTime() : null;
      const toMs = to ? new Date(`${to}T23:59:59.999Z`).getTime() : null;

      if (eventTypes.length) items = items.filter((i) => eventTypes.includes(i.eventType));
      if (approvalStatuses.length) items = items.filter((i) => approvalStatuses.includes(i.approvalStatus));
      if (departments.length) items = items.filter((i) => departments.includes((i.newDepartment || i.previousDepartment || '').toString()));
      if (businessUnits.length) items = items.filter((i) => businessUnits.includes((i.businessUnit || '').toString()));
      if (locations.length) items = items.filter((i) => locations.includes((i.location || i.newLocation || i.previousLocation || '').toString()));
      if (employeeStatuses.length) items = items.filter((i) => employeeStatuses.includes((i.newStatus || i.previousStatus || 'Active').toString()));
      if (createdBys.length) items = items.filter((i) => createdBys.includes((i.createdBy || '').toString()));
      if (managers.length) items = items.filter((i) => managers.includes((i.newManager || i.previousManager || '').toString()));
      if (jobTitles.length) items = items.filter((i) => jobTitles.includes((i.newJobTitle || i.previousJobTitle || '').toString()));
      if (prevGrades.length) items = items.filter((i) => prevGrades.includes((i.previousGrade || '').toString()));
      if (newGrades.length) items = items.filter((i) => newGrades.includes((i.newGrade || '').toString()));
      if (prevDepts.length) items = items.filter((i) => prevDepts.includes((i.previousDepartment || '').toString()));
      if (newDepts.length) items = items.filter((i) => newDepts.includes((i.newDepartment || '').toString()));
      if (fromMs !== null) items = items.filter((i) => new Date(i.effectiveDate).getTime() >= fromMs);
      if (toMs !== null) items = items.filter((i) => new Date(i.effectiveDate).getTime() <= toMs);
      if (q) {
        items = items.filter((i) => {
          return (
            i.employeeId.toLowerCase().includes(q) ||
            i.employeeName.toLowerCase().includes(q) ||
            i.eventType.toLowerCase().includes(q) ||
            i.referenceNo.toLowerCase().includes(q) ||
            (i.approvalId || '').toLowerCase().includes(q) ||
            (i.createdBy || '').toLowerCase().includes(q) ||
            (i.businessUnit || '').toLowerCase().includes(q) ||
            (i.location || '').toLowerCase().includes(q) ||
            (i.previousDepartment || '').toLowerCase().includes(q) ||
            (i.newDepartment || '').toLowerCase().includes(q) ||
            (i.previousJobTitle || '').toLowerCase().includes(q) ||
            (i.newJobTitle || '').toLowerCase().includes(q) ||
            (i.previousGrade || '').toLowerCase().includes(q) ||
            (i.newGrade || '').toLowerCase().includes(q) ||
            (i.previousManager || '').toLowerCase().includes(q) ||
            (i.newManager || '').toLowerCase().includes(q)
          );
        });
      }

      const safeItems = items.slice(0, 5000);
      if (fmt === 'xls') {
        const xls = exportXls(safeItems);
        return new NextResponse(xls, {
          headers: {
            'content-type': 'application/vnd.ms-excel; charset=utf-8',
            'content-disposition': `attachment; filename="employment-history.xls"`,
          },
        });
      }
      if (fmt === 'pdf') {
        const lines = safeItems.slice(0, 40).map((i) => `${i.referenceNo} | ${i.employeeId} | ${i.employeeName} | ${i.eventType} | ${i.approvalStatus} | ${i.effectiveDate.slice(0, 10)}`);
        const pdf = buildPdf('DLE HRIS — Employment History Export', lines);
        return new NextResponse(pdf, {
          headers: {
            'content-type': 'application/pdf',
            'content-disposition': `attachment; filename="employment-history.pdf"`,
          },
        });
      }
      const csv = exportCsv(safeItems);
      return new NextResponse(csv, {
        headers: {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': `attachment; filename="employment-history.csv"`,
        },
      });
    }

    if (!seg0) return jsonErr(404, 'Not found');
    const historyId = seg0;
    const item = historyStore.get(historyId);
    if (!item) return jsonErr(404, 'Not found');
    if (!perms.canViewAll) {
      if (item.employeeId !== viewerEmployeeId || item.approvalStatus !== 'Approved') return jsonErr(403, 'Permission denied');
    }
    return jsonOk(item);
  } catch (e) {
    return jsonErr(400, e instanceof Error ? e.message : 'Request failed');
  }
}

export async function POST(request: Request, ctx: { params: Promise<{ action: string[] }> }) {
  const role = getRole(request);
  const viewerEmployeeId = getViewerEmployeeId(request);
  const perms = permissions(role, viewerEmployeeId);
  const { action } = await ctx.params;
  const seg0 = action[0] || '';

  try {
    if (!seg0) {
      if (!perms.canCreate) return jsonErr(403, 'Permission denied');
      const body = (await request.json().catch(() => null)) as any;
      if (!body || typeof body !== 'object') return jsonErr(400, 'Invalid JSON body');

      const eventType = normalize(body.eventType) as EmploymentEventType;
      const employeeId = normalize(body.employeeId);
      const employeeName = normalize(body.employeeName);
      const effectiveDate = normalize(body.effectiveDate);
      const reason = normalize(body.reason, 800);
      const notes = normalize(body.notes, 2000) || null;

      const item: EmploymentHistoryItem = {
        id: `hist-${Math.random().toString(16).slice(2)}`,
        referenceNo: `HIST-${String(100000 + historyStore.size)}`,
        employeeId,
        employeeName,
        businessUnit: normalize(body.businessUnit) || null,
        location: normalize(body.location) || null,
        eventType,
        eventDate: nowIso(),
        effectiveDate,
        previousDepartment: normalize(body.previousDepartment) || null,
        newDepartment: normalize(body.newDepartment) || null,
        previousJobTitle: normalize(body.previousJobTitle) || null,
        newJobTitle: normalize(body.newJobTitle) || null,
        previousGrade: normalize(body.previousGrade) || null,
        newGrade: normalize(body.newGrade) || null,
        previousManager: normalize(body.previousManager) || null,
        newManager: normalize(body.newManager) || null,
        previousLocation: normalize(body.previousLocation) || null,
        newLocation: normalize(body.newLocation) || null,
        previousStatus: normalize(body.previousStatus) || null,
        newStatus: normalize(body.newStatus) || null,
        reason,
        notes,
        supportingDocument: body.supportingDocument && typeof body.supportingDocument === 'object' ? { id: normalize(body.supportingDocument.id), name: normalize(body.supportingDocument.name) } : null,
        approvalStatus: 'Draft',
        approvalId: null,
        approvedBy: null,
        approvedAt: null,
        createdBy: role,
        createdAt: nowIso(),
        updatedAt: null,
        audit: [],
        reverseOf: null,
      };

      validateEvent(item, { role });
      audit(item, role, 'History event created');
      historyStore.set(item.id, item);
      listStore.set(item.id, toListItem(item));
      return jsonOk(item);
    }

    const historyId = seg0;
    const actionKey = action[1] || '';
    const item = historyStore.get(historyId);
    if (!item) return jsonErr(404, 'Not found');
    if (!perms.canViewAll) return jsonErr(403, 'Permission denied');

    if (actionKey === 'submit') {
      if (!perms.canCreate) return jsonErr(403, 'Permission denied');
      if (item.approvalStatus !== 'Draft' && item.approvalStatus !== 'Rejected') return jsonErr(400, 'Only Draft/Rejected events can be submitted');
      item.approvalStatus = 'Submitted';
      item.approvalId = `APP-${String(80000 + Math.floor(Math.random() * 20000))}`;
      item.updatedAt = nowIso();
      audit(item, role, 'History event submitted');
      listStore.set(item.id, toListItem(item));
      return jsonOk(item);
    }

    if (actionKey === 'approve') {
      if (!perms.canApprove) return jsonErr(403, 'Permission denied');
      if (item.approvalStatus !== 'Submitted' && !item.approvalStatus.startsWith('Pending')) return jsonErr(400, 'Only Submitted/Pending events can be approved');
      item.approvalStatus = 'Approved';
      item.approvedBy = role;
      item.approvedAt = nowIso();
      item.updatedAt = item.approvedAt;
      audit(item, role, 'History event approved');
      updateOverrideFromApprovedEvent(item);
      audit(item, role, 'Profile updated from history event');
      listStore.set(item.id, toListItem(item));
      return jsonOk(item);
    }

    if (actionKey === 'reject') {
      if (!perms.canApprove) return jsonErr(403, 'Permission denied');
      const body = (await request.json().catch(() => null)) as any;
      const reason = normalize(body?.reason, 240) || 'Rejected';
      if (item.approvalStatus !== 'Submitted' && !item.approvalStatus.startsWith('Pending')) return jsonErr(400, 'Only Submitted/Pending events can be rejected');
      item.approvalStatus = 'Rejected';
      item.updatedAt = nowIso();
      audit(item, role, 'History event rejected', { reason });
      listStore.set(item.id, toListItem(item));
      return jsonOk(item);
    }

    if (actionKey === 'reverse') {
      if (!perms.canApprove) return jsonErr(403, 'Permission denied');
      if (item.approvalStatus !== 'Approved') return jsonErr(400, 'Only Approved events can be reversed');
      item.approvalStatus = 'Reversed';
      item.updatedAt = nowIso();
      audit(item, role, 'History event reversed');
      reverseOverrideForEvent(item.employeeId, item.id);
      listStore.set(item.id, toListItem(item));
      return jsonOk(item);
    }

    return jsonErr(404, 'Not found');
  } catch (e) {
    return jsonErr(400, e instanceof Error ? e.message : 'Request failed');
  }
}

export async function PATCH(request: Request, ctx: { params: Promise<{ action: string[] }> }) {
  const role = getRole(request);
  const viewerEmployeeId = getViewerEmployeeId(request);
  const perms = permissions(role, viewerEmployeeId);
  const { action } = await ctx.params;
  const historyId = action[0] || '';
  if (!historyId) return jsonErr(404, 'Not found');
  if (!perms.canCreate) return jsonErr(403, 'Permission denied');

  const item = historyStore.get(historyId);
  if (!item) return jsonErr(404, 'Not found');
  if (item.approvalStatus !== 'Draft' && item.approvalStatus !== 'Rejected') return jsonErr(400, 'Only Draft/Rejected events can be edited');

  const body = (await request.json().catch(() => null)) as any;
  if (!body || typeof body !== 'object') return jsonErr(400, 'Invalid JSON body');

  const before = JSON.stringify(toListItem(item));
  item.eventType = normalize(body.eventType) as EmploymentEventType;
  item.employeeId = normalize(body.employeeId);
  item.employeeName = normalize(body.employeeName);
  item.effectiveDate = normalize(body.effectiveDate);
  item.reason = normalize(body.reason, 800);
  item.notes = normalize(body.notes, 2000) || null;
  item.previousDepartment = normalize(body.previousDepartment) || null;
  item.newDepartment = normalize(body.newDepartment) || null;
  item.previousJobTitle = normalize(body.previousJobTitle) || null;
  item.newJobTitle = normalize(body.newJobTitle) || null;
  item.previousGrade = normalize(body.previousGrade) || null;
  item.newGrade = normalize(body.newGrade) || null;
  item.previousManager = normalize(body.previousManager) || null;
  item.newManager = normalize(body.newManager) || null;
  item.previousLocation = normalize(body.previousLocation) || null;
  item.newLocation = normalize(body.newLocation) || null;
  item.previousStatus = normalize(body.previousStatus) || null;
  item.newStatus = normalize(body.newStatus) || null;
  item.supportingDocument = body.supportingDocument && typeof body.supportingDocument === 'object' ? { id: normalize(body.supportingDocument.id), name: normalize(body.supportingDocument.name) } : item.supportingDocument;
  item.businessUnit = normalize(body.businessUnit) || item.businessUnit || null;
  item.location = normalize(body.location) || item.location || null;
  item.updatedAt = nowIso();
  validateEvent(item, { role });
  audit(item, role, 'History event edited', { oldValue: before, newValue: JSON.stringify(toListItem(item)) });
  listStore.set(item.id, toListItem(item));
  return jsonOk(item);
}
