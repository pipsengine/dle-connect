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

const validateEvent = (evt: Partial<EmploymentHistoryItem>) => {
  assertNonEmpty(normalize(evt.employeeId), 'Employee is required');
  assertNonEmpty(normalize(evt.employeeName), 'Employee name is required');
  assertNonEmpty(normalize(evt.eventType), 'Event type is required');
  assertNonEmpty(normalize(evt.effectiveDate), 'Effective date is required');
  assertNonEmpty(normalize(evt.reason), 'Reason is required');

  const eff = new Date(normalize(evt.effectiveDate)).getTime();
  if (!Number.isFinite(eff)) throw new Error('Effective date is invalid');

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
  }
};

const updateOverrideFromApprovedEvent = (evt: EmploymentHistoryItem) => {
  const employeeId = evt.employeeId;
  const existing = overridesStore.get(employeeId) || {};
  const next = { ...existing };
  next.profile = next.profile && typeof next.profile === 'object' ? { ...next.profile } : {};
  next.profile.jobDetails = next.profile.jobDetails && typeof next.profile.jobDetails === 'object' ? { ...next.profile.jobDetails } : {};
  next.profile.employmentDetails = next.profile.employmentDetails && typeof next.profile.employmentDetails === 'object' ? { ...next.profile.employmentDetails } : {};

  if (evt.eventType === 'Transfer' || evt.eventType === 'Department Change') {
    if (evt.newDepartment) {
      next.profile.department = evt.newDepartment;
      next.profile.jobDetails.department = evt.newDepartment;
    }
  }
  if (evt.eventType === 'Job Title Change' || evt.eventType === 'Promotion') {
    if (evt.newJobTitle) {
      next.profile.jobTitle = evt.newJobTitle;
      next.profile.jobDetails.jobTitle = evt.newJobTitle;
    }
  }
  if (evt.eventType === 'Promotion' || evt.eventType === 'Grade Change') {
    if (evt.newGrade) next.profile.jobDetails.jobGrade = evt.newGrade;
  }
  if (evt.eventType === 'Manager Change') {
    if (evt.newManager) {
      next.profile.reportingManager = evt.newManager;
      next.profile.jobDetails.reportingManager = evt.newManager;
    }
  }
  if (evt.eventType === 'Suspension' || evt.eventType === 'Reactivation' || evt.eventType === 'Resignation' || evt.eventType === 'Termination' || evt.eventType === 'Retirement') {
    if (evt.newStatus) {
      next.profile.employmentStatus = evt.newStatus;
      next.profile.employmentDetails.employmentStatus = evt.newStatus;
    }
  }

  const histEvent = {
    id: `h-${employeeId}-${Math.random().toString(16).slice(2)}`,
    at: evt.effectiveDate,
    type: evt.eventType,
    detail: evt.reason,
    actor: evt.approvedBy || 'HRIS',
  };
  next.history = Array.isArray(next.history) ? [histEvent, ...next.history] : [histEvent];

  overridesStore.set(employeeId, next);
};

const toListItem = (evt: EmploymentHistoryItem) => {
  return {
    id: evt.id,
    referenceNo: evt.referenceNo,
    employeeId: evt.employeeId,
    employeeName: evt.employeeName,
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
    base.splice(4, 0, { id: 'ai-6', severity: 'high', confidence: 0.9, title: '2 exited employees still appear active in payroll', recommendation: 'Reconcile exit events with payroll linkage and lock payment processing.', actionLabel: 'Open exits', action: 'filter:exit-payroll' });
  }
  return base;
};

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
      const employeeId = normalize(url.searchParams.get('employeeId'));
      let items = findVisibleItems(role, viewerEmployeeId);
      if (employeeId) items = items.filter((i) => i.employeeId === employeeId);
      const csv = exportCsv(items.slice(0, 2000));
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

      validateEvent(item);
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
      const employeeId = item.employeeId;
      const ov = overridesStore.get(employeeId);
      if (ov && typeof ov === 'object' && Array.isArray(ov.history)) ov.history = ov.history.filter((h: any) => h && h.detail !== item.reason);
      overridesStore.set(employeeId, ov);
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
  item.updatedAt = nowIso();
  validateEvent(item);
  audit(item, role, 'History event edited', { oldValue: before, newValue: JSON.stringify(toListItem(item)) });
  listStore.set(item.id, toListItem(item));
  return jsonOk(item);
}

