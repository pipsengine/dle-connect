/**
 * Exit Clearance department approval emails + automatic assignee resolution (DL-HRD-F-030).
 * Server-only. Assignees are never entered manually — resolved from HRIS line managers.
 */
import type { DleEmployeeDirectoryRow } from '@/lib/dle-enterprise-db';
import {
  type ClearanceNotificationLog,
  type ClearanceSection,
  type ExitClearanceCase,
} from '@/lib/exit-clearance-shared';
import { resolveLineManagerForEmployee } from '@/lib/leave-workflow-service';
import {
  normalizeMailboxAddress,
  resolveEmployeeMailbox,
  sendExitClearanceApprovalRequestEmail,
  sendExitClearanceFinalReadyEmail,
  sendExitClearanceSectionDecisionEmail,
  type MailSendResult,
} from '@/lib/mail-service';
import { readPayrollEmployees } from '@/lib/payroll-employee-source';
import { resolveWorkflowLinkOrigin } from '@/lib/public-app-url';

const compact = (value: unknown) => String(value || '').trim();
const lower = (value: unknown) => compact(value).toLowerCase();
const nowIso = () => new Date().toISOString();

/** Functional clearance sections map to the approving department in HRIS. */
const SECTION_DEPARTMENT_MATCHERS: Record<string, RegExp> = {
  hse: /\bhse\b|health\s*&?\s*safety|environment|qhse|qhs[e]/i,
  coop: /co-?op|cooperative|co-operative/i,
  it: /\bit\b|information\s*tech|ict|systems/i,
  hr: /\bhr\b|human\s*resources|admin(istration)?|people\s*&?\s*culture/i,
  finance: /finance|accounts|treasury|financial/i,
};

const isActiveEmployment = (employee: DleEmployeeDirectoryRow) => {
  const status = lower(employee.status);
  if (!status) return true;
  return !/(terminat|resign|exit|inactive|dismiss|deceased|left|retire)/.test(status);
};

const looksLikeManager = (employee: DleEmployeeDirectoryRow) =>
  /head|manager|supervisor|lead|chief|hod/i.test(`${employee.jobTitle || ''} ${employee.designation || ''}`);

const codesMatch = (left?: string | null, right?: string | null) => {
  const a = compact(left).toUpperCase().replace(/[^A-Z0-9]/g, '');
  const b = compact(right).toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!a || !b) return false;
  return a === b || a.replace(/^P/, '') === b.replace(/^P/, '');
};

const findEmployeeInDirectory = (
  employees: DleEmployeeDirectoryRow[],
  input: { employeeCode?: string | null; employeeId?: string | null; employeeName?: string | null },
) =>
  employees.find((row) =>
    codesMatch(row.employeeCode, input.employeeCode)
    || codesMatch(row.employeeId, input.employeeId)
    || codesMatch(row.employeeCode, input.employeeId)
    || codesMatch(row.sourceEmployeeId, input.employeeCode),
  )
  || employees.find((row) =>
    input.employeeName && lower(row.fullName) === lower(input.employeeName),
  )
  || null;

/**
 * Resolve the line manager / department head for a functional clearance department.
 * Prefer named departmentHead in that department, then titled managers.
 */
export const resolveDepartmentLineManager = (
  departmentPattern: RegExp,
  employees: DleEmployeeDirectoryRow[],
): DleEmployeeDirectoryRow | null => {
  const inDept = employees.filter((employee) =>
    isActiveEmployment(employee) && departmentPattern.test(compact(employee.department)),
  );
  if (!inDept.length) return null;

  const headNames = new Set(
    inDept.map((employee) => compact(employee.departmentHead)).filter(Boolean).map((name) => lower(name)),
  );
  const namedHead = inDept.find((employee) => headNames.has(lower(employee.fullName)));
  if (namedHead) return namedHead;

  const titledManager = inDept.find((employee) => looksLikeManager(employee));
  if (titledManager) return titledManager;

  // Fall back to any employee whose reporting-manager field points at them from within the dept.
  const referencedAsManager = inDept.find((candidate) =>
    inDept.some((row) =>
      lower(row.managerName) === lower(candidate.fullName)
      || codesMatch(row.managerName, candidate.employeeCode),
    ),
  );
  return referencedAsManager || null;
};

export type ResolvedClearanceAssignee = {
  sectionId: string;
  name: string;
  email: string;
  employeeCode: string;
  role: string;
  source: 'reporting-manager' | 'department-line-manager';
};

/** Resolve all section assignees automatically from HRIS (no manual entry). */
export const resolveExitClearanceAssignees = async (input: {
  employeeCode?: string | null;
  employeeId?: string | null;
  employeeName?: string | null;
  managerName?: string | null;
  sections: ClearanceSection[];
}): Promise<{ sections: ClearanceSection[]; assignees: ResolvedClearanceAssignee[]; errors: string[] }> => {
  const source = await readPayrollEmployees();
  const employees = source.employees || [];
  const subject = findEmployeeInDirectory(employees, input);
  const errors: string[] = [];
  const assignees: ResolvedClearanceAssignee[] = [];

  const withMailbox = async (employee: DleEmployeeDirectoryRow | null, label: string) => {
    if (!employee) return { name: '', email: '', code: '' };
    const email = normalizeMailboxAddress(
      (await resolveEmployeeMailbox(employee).catch(() => ''))
      || employee.officialEmail
      || employee.email
      || employee.personalEmail,
    );
    if (!email) {
      errors.push(`${label}: ${employee.fullName} has no email on file in HRIS.`);
    }
    return {
      name: compact(employee.fullName),
      email,
      code: compact(employee.employeeCode || employee.employeeId),
    };
  };

  // HOD / Unit = exiting employee's reporting line manager (same rule as Leave).
  let hodEmployee: DleEmployeeDirectoryRow | null = null;
  if (subject) {
    hodEmployee = resolveLineManagerForEmployee(subject, employees)?.employee || null;
    if (!hodEmployee) {
      errors.push(
        `HOD / Unit: no usable reporting manager for ${subject.fullName} (${subject.employeeCode}). Ask HR to correct reporting manager in HRIS.`,
      );
    }
  } else if (compact(input.managerName)) {
    hodEmployee = employees.find((row) =>
      isActiveEmployment(row) && lower(row.fullName) === lower(input.managerName),
    ) || null;
    if (!hodEmployee) {
      errors.push(`HOD / Unit: reporting manager "${compact(input.managerName)}" was not found as an active employee.`);
    }
  } else {
    errors.push('HOD / Unit: exiting employee was not found in HRIS, so the line manager cannot be resolved.');
  }

  const nextSections: ClearanceSection[] = [];
  for (const section of input.sections) {
    let resolved: DleEmployeeDirectoryRow | null = null;
    let source: ResolvedClearanceAssignee['source'] = 'department-line-manager';

    if (section.id === 'hod') {
      resolved = hodEmployee;
      source = 'reporting-manager';
    } else {
      const matcher = SECTION_DEPARTMENT_MATCHERS[section.id];
      if (!matcher) {
        errors.push(`${section.title}: no department mapping configured.`);
      } else {
        resolved = resolveDepartmentLineManager(matcher, employees);
        if (!resolved) {
          errors.push(`${section.title}: no active line manager / department head found for that department in HRIS.`);
        }
      }
    }

    const mailbox = await withMailbox(resolved, section.title);
    const assigneeName = mailbox.name || null;
    const assigneeEmail = mailbox.email || null;

    if (resolved && assigneeEmail) {
      assignees.push({
        sectionId: section.id,
        name: assigneeName || section.assigneeRole,
        email: assigneeEmail,
        employeeCode: mailbox.code,
        role: section.assigneeRole,
        source,
      });
    }

    nextSections.push({
      ...section,
      assigneeName,
      assigneeEmail,
      // Keep prior approval state; only overwrite assignee identity.
    });
  }

  return { sections: nextSections, assignees, errors };
};

export const clearanceFormWorkspaceUrl = (row: Pick<ExitClearanceCase, 'id' | 'employeeCode' | 'period'>, sectionId?: string) => {
  const origin = resolveWorkflowLinkOrigin();
  const params = new URLSearchParams({
    id: row.id,
    employeeCode: row.employeeCode,
    openForm: '1',
  });
  if (row.period) params.set('period', row.period);
  if (sectionId) params.set('section', sectionId);
  return `${origin}/hris/offboarding/exit-clearance?${params.toString()}`;
};

const pushLog = (
  logs: ClearanceNotificationLog[],
  entry: Omit<ClearanceNotificationLog, 'id' | 'at'> & { at?: string },
) => {
  logs.push({
    id: `ntf-${Date.now()}-${logs.length}`,
    at: entry.at || nowIso(),
    type: entry.type,
    sectionId: entry.sectionId ?? null,
    to: entry.to,
    sent: entry.sent,
    reason: entry.reason ?? null,
  });
};

export const resolveClearanceHrNotifyEmail = async (employees?: DleEmployeeDirectoryRow[]) => {
  const list = employees || (await readPayrollEmployees()).employees;
  const hrLm = resolveDepartmentLineManager(SECTION_DEPARTMENT_MATCHERS.hr, list);
  if (hrLm) {
    return normalizeMailboxAddress(
      (await resolveEmployeeMailbox(hrLm).catch(() => '')) || hrLm.officialEmail || hrLm.email,
    );
  }
  return '';
};

export const resolveClearanceFinanceNotifyEmail = async (employees?: DleEmployeeDirectoryRow[]) => {
  const list = employees || (await readPayrollEmployees()).employees;
  const financeLm = resolveDepartmentLineManager(SECTION_DEPARTMENT_MATCHERS.finance, list);
  if (financeLm) {
    return normalizeMailboxAddress(
      (await resolveEmployeeMailbox(financeLm).catch(() => '')) || financeLm.officialEmail || financeLm.email,
    );
  }
  return '';
};

export const notifyClearanceSectionApprovalRequest = async (input: {
  case: ExitClearanceCase;
  section: ClearanceSection;
  requestedBy: string;
  baseUrl?: string | null;
}) => {
  const to = normalizeMailboxAddress(input.section.assigneeEmail);
  const log: ClearanceNotificationLog[] = [];
  if (!to) {
    pushLog(log, {
      type: 'request',
      sectionId: input.section.id,
      to: '',
      sent: false,
      reason: `No line-manager email resolved for ${input.section.title}.`,
    });
    return { results: [] as MailSendResult[], log };
  }

  const result = await sendExitClearanceApprovalRequestEmail({
    recipientName: input.section.assigneeName || input.section.assigneeRole,
    recipientEmail: to,
    sectionTitle: input.section.title,
    assigneeRole: input.section.assigneeRole,
    employeeName: input.case.employeeName,
    employeeCode: input.case.employeeCode,
    department: input.case.department,
    dateOfExit: input.case.dateOfExit || input.case.lastWorkingDay || '',
    reference: input.case.resignationReference,
    requestedBy: input.requestedBy,
    workspaceUrl: clearanceFormWorkspaceUrl(input.case, input.section.id),
    baseUrl: input.baseUrl,
  });
  pushLog(log, {
    type: 'request',
    sectionId: input.section.id,
    to,
    sent: result.sent,
    reason: result.reason || null,
  });
  return { results: [result], log };
};

export const notifyClearanceSectionDecision = async (input: {
  case: ExitClearanceCase;
  section: ClearanceSection;
  decision: 'Approved' | 'Rejected';
  actorName: string;
  reason?: string | null;
  baseUrl?: string | null;
}) => {
  const to = await resolveClearanceHrNotifyEmail();
  const log: ClearanceNotificationLog[] = [];
  if (!to) {
    pushLog(log, {
      type: input.decision === 'Approved' ? 'approved' : 'rejected',
      sectionId: input.section.id,
      to: '',
      sent: false,
      reason: 'HR department line manager email could not be resolved.',
    });
    return { results: [] as MailSendResult[], log };
  }
  const result = await sendExitClearanceSectionDecisionEmail({
    recipientName: 'HR',
    recipientEmail: to,
    decision: input.decision,
    sectionTitle: input.section.title,
    employeeName: input.case.employeeName,
    employeeCode: input.case.employeeCode,
    actorName: input.actorName,
    reason: input.reason,
    workspaceUrl: clearanceFormWorkspaceUrl(input.case, input.section.id),
    baseUrl: input.baseUrl,
  });
  pushLog(log, {
    type: input.decision === 'Approved' ? 'approved' : 'rejected',
    sectionId: input.section.id,
    to,
    sent: result.sent,
    reason: result.reason || null,
  });
  return { results: [result], log };
};

export const notifyClearanceFinalReady = async (input: {
  case: ExitClearanceCase;
  baseUrl?: string | null;
}) => {
  const source = await readPayrollEmployees();
  const recipients = [
    { name: 'HR', email: await resolveClearanceHrNotifyEmail(source.employees) },
    { name: 'Finance', email: await resolveClearanceFinanceNotifyEmail(source.employees) },
  ].filter((row, index, all) => row.email && all.findIndex((item) => item.email === row.email) === index);

  const log: ClearanceNotificationLog[] = [];
  const results: MailSendResult[] = [];
  if (!recipients.length) {
    pushLog(log, {
      type: 'final_ready',
      to: '',
      sent: false,
      reason: 'HR/Finance line manager emails could not be resolved from HRIS.',
    });
    return { results, log };
  }

  for (const recipient of recipients) {
    const result = await sendExitClearanceFinalReadyEmail({
      recipientName: recipient.name,
      recipientEmail: recipient.email,
      employeeName: input.case.employeeName,
      employeeCode: input.case.employeeCode,
      reference: input.case.resignationReference,
      workspaceUrl: clearanceFormWorkspaceUrl(input.case),
      baseUrl: input.baseUrl,
    });
    results.push(result);
    pushLog(log, {
      type: 'final_ready',
      to: recipient.email,
      sent: result.sent,
      reason: result.reason || null,
    });
  }
  return { results, log };
};
