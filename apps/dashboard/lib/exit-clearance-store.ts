/**
 * Exit Clearance store — digital CLEARANCE FORM (DL-HRD-F-030).
 * Server-only. Client UIs import exit-clearance-shared.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  type ClearanceFinalSignOff,
  type ClearanceItem,
  type ClearanceItemState,
  type ClearanceSection,
  type ExitClearanceCase,
  type ExitClearanceCaseStatus,
  type ExitClearancePayload,
  type OffboardingModuleKpi,
  CLEARANCE_DOC_NO,
  CLEARANCE_DOC_REV,
  buildDefaultClearanceSections,
  deriveSectionStatus,
  exitClearancePct,
  isReadyForFinalPayroll,
} from '@/lib/exit-clearance-shared';
import {
  caseHasClearanceAssignmentFor,
  isClearanceSectionAssignee,
  type ClearanceAssigneeViewer,
} from '@/lib/access/offboarding-access';
import {
  notifyClearanceFinalReady,
  notifyClearanceSectionApprovalRequest,
  notifyClearanceSectionDecision,
  resolveExitClearanceAssignees,
} from '@/lib/exit-clearance-notifications';
import {
  currentResignationPeriod,
  periodLabelFromCode,
  type ResignationRecord,
} from '@/lib/resignation-management-shared';
import {
  findResignationByEmployee,
  listResignations,
  syncResignationProgressItem,
} from '@/lib/resignation-management-store';

export type { ExitClearanceCase, ExitClearancePayload } from '@/lib/exit-clearance-shared';
export { currentResignationPeriod as currentExitClearancePeriod, periodLabelFromCode } from '@/lib/resignation-management-shared';

const resolveDashboardRoot = () => {
  const cwd = process.cwd();
  const dashboardSuffix = path.join('apps', 'dashboard');
  return cwd.endsWith(dashboardSuffix) ? cwd : path.join(cwd, dashboardSuffix);
};

const DATA_DIR = path.join(process.env.DLE_HRIS_DATA_DIR || path.join(resolveDashboardRoot(), 'data', 'hris'));
const FILE_PATH = path.join(DATA_DIR, 'exit-clearance.json');

const compact = (value: unknown) => String(value || '').trim();
const nowIso = () => new Date().toISOString();
const todayDate = () => nowIso().slice(0, 10);

const codesMatch = (left?: string | null, right?: string | null) => {
  const a = compact(left).toUpperCase().replace(/[^A-Z0-9]/g, '');
  const b = compact(right).toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!a || !b) return false;
  return a === b || a.replace(/^P/, '') === b.replace(/^P/, '');
};

const ensureDir = async () => {
  await mkdir(DATA_DIR, { recursive: true });
};

const emptyFinal = (): ClearanceFinalSignOff => ({ signedBy: null, signedAt: null });

const normalizeSection = (section: ClearanceSection, defaults?: ClearanceSection): ClearanceSection => {
  const base = defaults || buildDefaultClearanceSections().find((item) => item.id === section.id);
  const merged: ClearanceSection = {
    id: section.id,
    title: section.title || base?.title || section.id,
    subtitle: section.subtitle || base?.subtitle,
    items: (section.items || base?.items || []).map((item: ClearanceItem) => ({
      ...item,
      detail: item.detail ?? null,
      amount: item.amount ?? null,
    })),
    signedBy: section.signedBy || null,
    signedAt: section.signedAt || null,
    status: 'Pending',
    approvalStatus: section.approvalStatus || 'Not Requested',
    assigneeRole: section.assigneeRole || base?.assigneeRole || 'Approver',
    assigneeName: section.assigneeName ?? base?.assigneeName ?? null,
    assigneeEmail: section.assigneeEmail ?? base?.assigneeEmail ?? null,
    requestedAt: section.requestedAt || null,
    requestedBy: section.requestedBy || null,
    approvedAt: section.approvedAt || null,
    approvedBy: section.approvedBy || null,
    rejectionReason: section.rejectionReason || null,
    lastNotifiedAt: section.lastNotifiedAt || null,
  };
  merged.status = deriveSectionStatus(merged);
  return merged;
};

const normalizeSections = (raw: any): ClearanceSection[] => {
  const defaults = buildDefaultClearanceSections();
  if (Array.isArray(raw?.sections) && raw.sections.length) {
    return raw.sections.map((section: ClearanceSection) =>
      normalizeSection(section, defaults.find((item) => item.id === section.id)),
    );
  }
  return defaults;
};

/** Auto-resolve department line managers from HRIS and merge onto the case. */
const applyResolvedAssignees = async (row: ExitClearanceCase, options?: { requireComplete?: boolean }) => {
  const resolved = await resolveExitClearanceAssignees({
    employeeCode: row.employeeCode,
    employeeId: row.employeeId,
    employeeName: row.employeeName,
    managerName: row.managerName,
    sections: row.sections,
  });
  if (options?.requireComplete && resolved.errors.length) {
    throw new Error(resolved.errors.join(' '));
  }
  row.sections = resolved.sections.map((section) => normalizeSection(section));
  return resolved;
};

const refreshCaseDerived = (row: ExitClearanceCase): ExitClearanceCase => {
  const sections = (row.sections || []).map((section) => ({
    ...section,
    status: deriveSectionStatus(section),
  }));
  const completionPct = exitClearancePct(sections);
  const blocked = sections.some((section) => section.status === 'Blocked');
  const readyForFinalPayroll = isReadyForFinalPayroll({ ...row, sections });
  let status: ExitClearanceCaseStatus = 'Not Started';
  if (blocked) status = 'Blocked';
  else if (readyForFinalPayroll) status = 'Completed';
  else if (
    completionPct > 0
    || sections.some((s) => s.status !== 'Pending' || s.approvalStatus !== 'Not Requested')
    || row.hrFinal?.signedBy
    || row.financeFinal?.signedBy
    || row.approvalsRequestedAt
  ) {
    status = 'In Progress';
  }
  return {
    ...row,
    sections,
    completionPct,
    readyForFinalPayroll,
    status,
    documentNumber: row.documentNumber || CLEARANCE_DOC_NO,
    documentRev: row.documentRev || CLEARANCE_DOC_REV,
    hrFinal: row.hrFinal || emptyFinal(),
    financeFinal: row.financeFinal || emptyFinal(),
    approvalsRequestedAt: row.approvalsRequestedAt || null,
    approvalsRequestedBy: row.approvalsRequestedBy || null,
    notificationLog: Array.isArray(row.notificationLog) ? row.notificationLog : [],
  };
};

const readJson = async (): Promise<ExitClearanceCase[]> => {
  try {
    const raw = await readFile(FILE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((row) => refreshCaseDerived({
      ...row,
      sections: normalizeSections(row),
      hrFinal: row.hrFinal || emptyFinal(),
      financeFinal: row.financeFinal || emptyFinal(),
      dateOfExit: row.dateOfExit || row.lastWorkingDay || null,
      documentNumber: row.documentNumber || CLEARANCE_DOC_NO,
      documentRev: row.documentRev || CLEARANCE_DOC_REV,
      readyForFinalPayroll: Boolean(row.readyForFinalPayroll),
      approvalsRequestedAt: row.approvalsRequestedAt || null,
      approvalsRequestedBy: row.approvalsRequestedBy || null,
      notificationLog: row.notificationLog || [],
    }));
  } catch {
    return [];
  }
};

const writeJson = async (rows: ExitClearanceCase[]) => {
  await ensureDir();
  await writeFile(FILE_PATH, `${JSON.stringify(rows, null, 2)}\n`, 'utf8');
};

const fromResignation = (row: ResignationRecord, actor: string, existing?: ExitClearanceCase | null): ExitClearanceCase => {
  const sections = existing?.sections?.length
    ? normalizeSections({ sections: existing.sections })
    : buildDefaultClearanceSections();
  const base: ExitClearanceCase = {
    id: existing?.id || `CLR-${row.id}`,
    period: row.period,
    resignationId: row.id,
    resignationReference: row.referenceNumber,
    employeeId: row.employeeId,
    employeeCode: row.employeeCode,
    employeeName: row.employeeName,
    department: row.department,
    position: row.position,
    managerName: row.managerName,
    resignationDate: row.resignationDate,
    lastWorkingDay: row.lastWorkingDay,
    dateOfExit: existing?.dateOfExit || row.lastWorkingDay,
    resignationStatus: row.status,
    documentNumber: CLEARANCE_DOC_NO,
    documentRev: CLEARANCE_DOC_REV,
    status: 'Not Started',
    completionPct: 0,
    readyForFinalPayroll: false,
    approvalsRequestedAt: existing?.approvalsRequestedAt || null,
    approvalsRequestedBy: existing?.approvalsRequestedBy || null,
    sections,
    hrFinal: existing?.hrFinal || emptyFinal(),
    financeFinal: existing?.financeFinal || emptyFinal(),
    notificationLog: existing?.notificationLog || [],
    createdAt: existing?.createdAt || nowIso(),
    updatedAt: nowIso(),
    updatedBy: actor,
  };
  return refreshCaseDerived(base);
};

const eligibleResignation = (row: ResignationRecord) =>
  ['Serving Notice', 'Handover', 'Clearance', 'Final Payroll', 'Completed'].includes(row.status);

export const syncExitClearanceFromResignations = async (period?: string, actor = 'System') => {
  const periodCode = period || currentResignationPeriod();
  const resignations = (await listResignations(periodCode)).filter(eligibleResignation);
  const all = await readJson();
  const byResignation = new Map(all.filter((row) => row.period === periodCode).map((row) => [row.resignationId, row]));
  const nextPeriodRows = resignations.map((row) => fromResignation(row, actor, byResignation.get(row.id) || null));
  const others = all.filter((row) => row.period !== periodCode);
  await writeJson([...others, ...nextPeriodRows]);
  return nextPeriodRows;
};

/** Open or create a clearance form from an active resignation (by employee). */
export const openExitClearanceForEmployee = async (input: {
  actor: string;
  employeeCode?: string | null;
  employeeId?: string | null;
  period?: string | null;
}) => {
  const resignation = await findResignationByEmployee({
    employeeCode: input.employeeCode,
    employeeId: input.employeeId,
  });
  if (!resignation) {
    throw new Error('No active resignation found for this employee. Start Resignation Management first.');
  }
  if (['Draft', 'Cancelled'].includes(resignation.status)) {
    throw new Error(`Resignation is "${resignation.status}". Submit and progress the case before clearance.`);
  }

  const period = input.period || resignation.period || currentResignationPeriod();
  const all = await readJson();
  const existing = all.find((row) => row.resignationId === resignation.id || (
    row.period === period && codesMatch(row.employeeCode, resignation.employeeCode)
  )) || null;
  const next = fromResignation(resignation, input.actor, existing);
  await applyResolvedAssignees(next);
  const refreshed = refreshCaseDerived({ ...next, updatedAt: nowIso(), updatedBy: input.actor });
  const without = all.filter((row) => row.id !== refreshed.id && row.resignationId !== resignation.id);
  without.push(refreshed);
  await writeJson(without);
  return refreshed;
};

const buildKpis = (cases: ExitClearanceCase[]): OffboardingModuleKpi[] => {
  const inProgress = cases.filter((row) => row.status === 'In Progress').length;
  const completed = cases.filter((row) => row.status === 'Completed').length;
  const notStarted = cases.filter((row) => row.status === 'Not Started').length;
  const blocked = cases.filter((row) => row.status === 'Blocked').length;
  const ready = cases.filter((row) => row.readyForFinalPayroll).length;
  return [
    { id: 'total', label: 'Clearance Forms', value: cases.length, display: String(cases.length), deltaLabel: 'This period', tone: 'blue' },
    { id: 'pending', label: 'Not Started', value: notStarted, display: String(notStarted), deltaLabel: 'Awaiting departments', tone: 'amber' },
    { id: 'progress', label: 'In Progress', value: inProgress, display: String(inProgress), deltaLabel: 'Partial sign-off', tone: 'purple' },
    { id: 'done', label: 'Completed', value: completed, display: String(completed), deltaLabel: 'Form complete', tone: 'green' },
    { id: 'blocked', label: 'Blocked', value: blocked, display: String(blocked), deltaLabel: 'Outstanding items', tone: 'rose' },
    { id: 'ready', label: 'Ready for Payroll', value: ready, display: String(ready), deltaLabel: 'HR + Finance signed', tone: 'mint' },
  ];
};

const tabCountsFor = (cases: ExitClearanceCase[]) => {
  const counts: Record<string, number> = {
    All: cases.length,
    'Not Started': 0,
    'In Progress': 0,
    Completed: 0,
    Blocked: 0,
  };
  for (const row of cases) {
    counts[row.status] = (counts[row.status] || 0) + 1;
  }
  return counts;
};

export const buildExitClearancePayload = async (input?: {
  period?: string;
  selectedId?: string | null;
  employeeCode?: string | null;
  employeeId?: string | null;
  actor?: string;
  viewer?: ClearanceAssigneeViewer | null;
  accessMode?: 'hr' | 'line-manager';
}): Promise<ExitClearancePayload> => {
  const period = input?.period || currentResignationPeriod();
  const accessMode = input?.accessMode || 'hr';
  let cases = accessMode === 'hr'
    ? await syncExitClearanceFromResignations(period, input?.actor || 'System')
    : (await readJson()).filter((row) => row.period === period);

  if (accessMode === 'line-manager' && input?.viewer) {
    cases = cases.filter((row) => caseHasClearanceAssignmentFor(row, input.viewer!));
  }

  cases.sort((a, b) => a.employeeName.localeCompare(b.employeeName));

  let selectedId = input?.selectedId || null;
  if (!selectedId && (input?.employeeCode || input?.employeeId)) {
    const hit = cases.find((row) =>
      codesMatch(row.employeeCode, input.employeeCode)
      || codesMatch(row.employeeId, input.employeeId)
      || codesMatch(row.employeeCode, input.employeeId),
    );
    selectedId = hit?.id || null;
  }
  if (!selectedId) selectedId = cases[0]?.id || null;

  return {
    generatedAt: nowIso(),
    period,
    periodLabel: periodLabelFromCode(period),
    cases,
    kpis: buildKpis(cases),
    tabCounts: tabCountsFor(cases),
    selectedId,
    selected: cases.find((row) => row.id === selectedId) || null,
    accessMode,
    viewerName: input?.viewer?.fullName || null,
    filterOptions: {
      departments: [...new Set(cases.map((row) => row.department).filter(Boolean))].sort(),
      statuses: ['Not Started', 'In Progress', 'Completed', 'Blocked'],
    },
  };
};

const sectionNeedsDetail = (section: ClearanceSection) =>
  section.items.some((item) => {
    if (item.state === 'Outstanding' && item.input === 'detail' && !compact(item.detail)) return true;
    if (item.state === 'Outstanding' && item.input === 'amount' && item.amount == null && !compact(item.detail)) return true;
    if (item.id === 'coop_loan' && item.state === 'Outstanding' && !compact(item.detail)) return true;
    return false;
  });

const validateSectionSignOff = (section: ClearanceSection) => {
  if (sectionNeedsDetail(section)) {
    throw new Error(`${section.title}: provide action / detail for outstanding items.`);
  }
  if (section.signedBy?.trim() && !section.signedAt) {
    throw new Error(`${section.title}: sign-off date is required with authorized signature.`);
  }
  if (section.signedAt && !section.signedBy?.trim()) {
    throw new Error(`${section.title}: authorized signature is required with sign-off date.`);
  }
  const allDoneOrNa = section.items.every((item) => item.state === 'Done' || item.state === 'N/A');
  if (allDoneOrNa && !section.signedBy?.trim()) {
    throw new Error(`${section.title}: authorized signature and date are required to clear this section.`);
  }
};

export const updateExitClearanceCase = async (input: {
  id: string;
  actor: string;
  action?:
    | 'save'
    | 'complete'
    | 'sign_section'
    | 'sign_hr_final'
    | 'sign_finance_final'
    | 'resolve_assignees'
    | 'request_approvals'
    | 'approve_section'
    | 'reject_section';
  sectionId?: string;
  itemId?: string;
  itemState?: ClearanceItemState;
  itemDetail?: string | null;
  itemAmount?: number | null;
  signedBy?: string | null;
  signedAt?: string | null;
  dateOfExit?: string | null;
  sections?: ClearanceSection[];
  hrFinal?: ClearanceFinalSignOff;
  financeFinal?: ClearanceFinalSignOff;
  rejectionReason?: string | null;
  /** When set, approve/reject must target a section assigned to this viewer. */
  viewer?: ClearanceAssigneeViewer | null;
  accessMode?: 'hr' | 'line-manager';
}) => {
  const all = await readJson();
  const index = all.findIndex((row) => row.id === input.id);
  if (index < 0) throw new Error('Exit clearance case not found.');
  let row: ExitClearanceCase = {
    ...all[index],
    sections: all[index].sections.map((section) => ({
      ...section,
      items: section.items.map((item) => ({ ...item })),
    })),
    hrFinal: { ...(all[index].hrFinal || emptyFinal()) },
    financeFinal: { ...(all[index].financeFinal || emptyFinal()) },
    notificationLog: [...(all[index].notificationLog || [])],
  };

  if (input.dateOfExit !== undefined) {
    row.dateOfExit = input.dateOfExit;
  }

  if (input.sections?.length) {
    // Never accept client-supplied assignees — keep server-resolved line managers.
    const previousById = new Map(
      row.sections.map((section) => [
        section.id,
        {
          assigneeName: section.assigneeName,
          assigneeEmail: section.assigneeEmail,
          approvalStatus: section.approvalStatus,
          requestedAt: section.requestedAt,
          requestedBy: section.requestedBy,
          approvedAt: section.approvedAt,
          approvedBy: section.approvedBy,
          rejectionReason: section.rejectionReason,
          lastNotifiedAt: section.lastNotifiedAt,
        },
      ]),
    );
    row.sections = input.sections.map((section) => {
      const normalized = normalizeSection(section);
      const previous = previousById.get(section.id);
      return {
        ...normalized,
        assigneeName: previous?.assigneeName ?? null,
        assigneeEmail: previous?.assigneeEmail ?? null,
        approvalStatus: previous?.approvalStatus || normalized.approvalStatus,
        requestedAt: previous?.requestedAt ?? normalized.requestedAt,
        requestedBy: previous?.requestedBy ?? normalized.requestedBy,
        approvedAt: previous?.approvedAt ?? normalized.approvedAt,
        approvedBy: previous?.approvedBy ?? normalized.approvedBy,
        rejectionReason: previous?.rejectionReason ?? normalized.rejectionReason,
        lastNotifiedAt: previous?.lastNotifiedAt ?? normalized.lastNotifiedAt,
      };
    });
  }

  if (input.sectionId && input.itemId && input.itemState) {
    row.sections = row.sections.map((section) => {
      if (section.id !== input.sectionId) return section;
      return {
        ...section,
        items: section.items.map((item) => {
          if (item.id !== input.itemId) return item;
          return {
            ...item,
            state: input.itemState!,
            detail: input.itemDetail !== undefined ? input.itemDetail : item.detail,
            amount: input.itemAmount !== undefined ? input.itemAmount : item.amount,
          };
        }),
      };
    });
  }

  if (input.action === 'resolve_assignees' || input.action === 'request_approvals') {
    await applyResolvedAssignees(row, { requireComplete: input.action === 'request_approvals' });
  }

  if (input.action === 'request_approvals') {
    const missing = row.sections.filter((section) => !compact(section.assigneeEmail));
    if (missing.length) {
      throw new Error(
        `Unable to request approvals — HRIS could not resolve a line manager email for: ${missing.map((s) => s.title).join(', ')}.`,
      );
    }
    row.approvalsRequestedAt = nowIso();
    row.approvalsRequestedBy = input.actor;
    const logs = [...row.notificationLog];
    for (const section of row.sections) {
      if (section.approvalStatus === 'Approved') continue;
      section.approvalStatus = 'Awaiting Approval';
      section.requestedAt = nowIso();
      section.requestedBy = input.actor;
      section.rejectionReason = null;
      const notified = await notifyClearanceSectionApprovalRequest({
        case: row,
        section,
        requestedBy: input.actor,
      });
      section.lastNotifiedAt = nowIso();
      logs.push(...notified.log);
    }
    row.notificationLog = logs;
  }

  if (input.action === 'approve_section') {
    if (!input.sectionId) throw new Error('Section id is required to approve.');
    if (input.accessMode === 'line-manager' && input.viewer) {
      const target = row.sections.find((section) => section.id === input.sectionId);
      if (!target || !isClearanceSectionAssignee(target, input.viewer)) {
        throw new Error('You can only approve the clearance section assigned to you.');
      }
    }
    row.sections = row.sections.map((section) => {
      if (section.id !== input.sectionId) return section;
      const next: ClearanceSection = {
        ...section,
        approvalStatus: 'Approved',
        approvedAt: nowIso(),
        approvedBy: input.actor,
        rejectionReason: null,
        signedBy: compact(input.signedBy) || compact(input.actor) || section.signedBy,
        signedAt: input.signedAt || todayDate(),
        items: section.items.map((item) => ({
          ...item,
          state: item.state === 'Pending' ? 'Done' : item.state,
        })),
      };
      validateSectionSignOff(next);
      return next;
    });
    const section = row.sections.find((item) => item.id === input.sectionId)!;
    const notified = await notifyClearanceSectionDecision({
      case: row,
      section,
      decision: 'Approved',
      actorName: input.actor,
    });
    row.notificationLog = [...row.notificationLog, ...notified.log];
  }

  if (input.action === 'reject_section') {
    if (!input.sectionId) throw new Error('Section id is required to reject.');
    if (input.accessMode === 'line-manager' && input.viewer) {
      const target = row.sections.find((section) => section.id === input.sectionId);
      if (!target || !isClearanceSectionAssignee(target, input.viewer)) {
        throw new Error('You can only reject the clearance section assigned to you.');
      }
    }
    const reason = compact(input.rejectionReason);
    if (!reason) throw new Error('Rejection reason is required.');
    row.sections = row.sections.map((section) => {
      if (section.id !== input.sectionId) return section;
      return {
        ...section,
        approvalStatus: 'Rejected',
        approvedAt: null,
        approvedBy: null,
        rejectionReason: reason,
        signedBy: compact(input.signedBy) || compact(input.actor) || section.signedBy,
        signedAt: input.signedAt || todayDate(),
      };
    });
    const section = row.sections.find((item) => item.id === input.sectionId)!;
    const notified = await notifyClearanceSectionDecision({
      case: row,
      section,
      decision: 'Rejected',
      actorName: input.actor,
      reason,
    });
    row.notificationLog = [...row.notificationLog, ...notified.log];
  }

  if (input.sectionId && (input.action === 'sign_section' || (input.action !== 'approve_section' && input.action !== 'reject_section' && (input.signedBy !== undefined || input.signedAt !== undefined)))) {
    if (!['approve_section', 'reject_section', 'request_approvals', 'resolve_assignees'].includes(String(input.action || ''))) {
      row.sections = row.sections.map((section) => {
        if (section.id !== input.sectionId) return section;
        const next: ClearanceSection = {
          ...section,
          signedBy: input.signedBy !== undefined ? compact(input.signedBy) || null : section.signedBy,
          signedAt: input.signedAt !== undefined ? input.signedAt : section.signedAt,
        };
        if (input.action === 'sign_section') {
          next.signedBy = compact(input.signedBy) || compact(input.actor) || section.signedBy;
          next.signedAt = input.signedAt || todayDate();
          if (next.approvalStatus === 'Awaiting Approval' || next.approvalStatus === 'Not Requested') {
            next.approvalStatus = 'Approved';
            next.approvedAt = nowIso();
            next.approvedBy = next.signedBy;
          }
        }
        validateSectionSignOff(next);
        return next;
      });
    }
  }

  if (input.hrFinal) row.hrFinal = input.hrFinal;
  if (input.financeFinal) row.financeFinal = input.financeFinal;

  if (input.action === 'sign_hr_final') {
    row.hrFinal = {
      signedBy: compact(input.signedBy) || compact(input.actor),
      signedAt: input.signedAt || todayDate(),
    };
  }
  if (input.action === 'sign_finance_final') {
    row.financeFinal = {
      signedBy: compact(input.signedBy) || compact(input.actor),
      signedAt: input.signedAt || todayDate(),
    };
  }

  if (input.action === 'complete') {
    for (const section of row.sections) {
      section.items = section.items.map((item) => ({
        ...item,
        state: item.state === 'Pending' || item.state === 'Outstanding' ? 'Done' : item.state,
      }));
      if (!section.signedBy) section.signedBy = compact(input.actor);
      if (!section.signedAt) section.signedAt = todayDate();
      section.approvalStatus = 'Approved';
      section.approvedAt = section.approvedAt || nowIso();
      section.approvedBy = section.approvedBy || input.actor;
      validateSectionSignOff(section);
    }
    if (!row.hrFinal.signedBy) {
      row.hrFinal = { signedBy: compact(input.actor), signedAt: todayDate() };
    }
    if (!row.financeFinal.signedBy) {
      row.financeFinal = { signedBy: compact(input.actor), signedAt: todayDate() };
    }
  }

  const wasReady = all[index].readyForFinalPayroll;
  row = refreshCaseDerived(row);

  // When all sections cleared first time, notify HR/Finance for final sign-off.
  const allSectionsCleared = row.sections.every((section) => section.status === 'Cleared');
  if (allSectionsCleared && !wasReady && !row.readyForFinalPayroll) {
    const notified = await notifyClearanceFinalReady({ case: row });
    row.notificationLog = [...row.notificationLog, ...notified.log];
  }

  row.updatedAt = nowIso();
  row.updatedBy = input.actor;
  all[index] = row;
  await writeJson(all);

  const progressStatus = row.status === 'Completed' ? 'Completed' : row.status === 'Not Started' ? 'Not Started' : 'In Progress';
  await syncResignationProgressItem({
    resignationId: row.resignationId,
    actor: input.actor,
    progressId: 'clearance',
    progressStatus,
    advanceStatusTo: row.readyForFinalPayroll ? 'Final Payroll' : undefined,
  });

  return row;
};

export const exitClearancesToCsv = (rows: ExitClearanceCase[]) => {
  const header = [
    'Employee', 'Employee ID', 'Department', 'Date of Exit', 'Clearance %',
    'Ready for Payroll', 'Status', 'Doc No', 'Resignation',
  ];
  const lines = rows.map((row) => [
    row.employeeName,
    row.employeeCode,
    row.department,
    row.dateOfExit || row.lastWorkingDay || '',
    row.completionPct,
    row.readyForFinalPayroll ? 'Yes' : 'No',
    row.status,
    row.documentNumber,
    row.resignationReference,
  ].map((value) => `"${String(value).replace(/"/g, '""')}"`).join(','));
  return [header.join(','), ...lines].join('\n');
};
