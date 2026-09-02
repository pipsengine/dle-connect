import { readUsers } from '@/lib/auth/auth-store';
import type { SessionPayload } from '@/lib/auth/session';
import { createEnterpriseNotification } from '@/lib/enterprise-notifications-store';
import { resolveEmployeeMailbox, sendTimesheetApprovalRequestEmail } from '@/lib/mail-service';
import { toAbsoluteWorkflowHref } from '@/lib/public-app-url';
import type { TimesheetHeader, TimesheetWorkflowStage } from '@/lib/timesheet-entry-store';

type NotifyInput = {
  title: string;
  body: string;
  severity?: 'info' | 'success' | 'warning' | 'critical';
  recipientRoles?: string[];
  recipientEmployeeCode?: string;
  recipientNameHint?: string;
  header?: TimesheetHeader | null;
  projectCode?: string | null;
  stageLabel?: string;
  actorName?: string;
};

const approvalHref = '/hris/time-and-logs/timesheet-approval';
const compact = (value: unknown) => String(value || '').trim();

const systemSession = (): SessionPayload => ({
  sub: 'timesheet-workflow',
  username: 'timesheet-workflow',
  fullName: 'Timesheet Workflow',
  roles: ['System'],
  permissions: [],
  status: 'Active',
  firstLoginRequired: false,
  passwordResetRequired: false,
  isGlobalAdmin: true,
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + 3600,
});

const employeeCodeFromLabel = (value?: string | null) => {
  const text = compact(value);
  const token = text.split(' - ')[0]?.trim() || '';
  return /^[A-Z]{0,3}\d+/i.test(token) ? token.toUpperCase() : '';
};

const nameFromLabel = (value?: string | null) => {
  const text = compact(value);
  if (!text) return '';
  const parts = text.split(' - ');
  return parts.length > 1 ? parts.slice(1).join(' - ').trim() : text;
};

const roleMatches = (userRoles: string[], needed: string[]) => {
  const haystack = userRoles.map((role) => role.toLowerCase());
  return needed.some((need) => {
    const needle = need.toLowerCase();
    return haystack.some((role) => role === needle || role.includes(needle) || needle.includes(role));
  });
};

type ResolvedRecipient = {
  employeeCode: string;
  fullName: string;
  email: string;
};

const resolveTimesheetApproverRecipients = async (input: {
  employeeCode?: string;
  nameHint?: string;
  roles: string[];
}): Promise<ResolvedRecipient[]> => {
  const users = await readUsers().catch(() => []);
  const code = compact(input.employeeCode).toUpperCase();
  const nameHint = compact(input.nameHint).toLowerCase();
  const byCode = code
    ? users.filter((user) => [user.employeeCode, user.employeeId, user.username]
      .map((value) => compact(value).toUpperCase())
      .includes(code))
    : [];
  const byName = !byCode.length && nameHint
    ? users.filter((user) => {
      const fullName = compact(user.fullName).toLowerCase();
      return Boolean(fullName) && (fullName.includes(nameHint) || nameHint.includes(fullName));
    })
    : [];
  const named = byCode.length ? byCode : byName;
  const picked = named.length ? named : users.filter((user) => roleMatches(user.roles, input.roles));
  const seen = new Set<string>();
  const recipients: ResolvedRecipient[] = [];
  for (const user of picked) {
    const employeeCode = compact(user.employeeCode || user.username);
    const key = employeeCode.toUpperCase() || compact(user.email).toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const email = compact(user.email)
      || await resolveEmployeeMailbox({
        employeeCode,
        employeeId: user.employeeId || employeeCode,
        fullName: user.fullName,
        officialEmail: user.email,
      } as never);
    recipients.push({
      employeeCode,
      fullName: compact(user.fullName) || employeeCode,
      email,
    });
  }
  return recipients;
};

/**
 * In-app + email alert for the people who must act next.
 * Named supervisor/PM is preferred; role matching is the fallback.
 */
export const notifyTimesheetWorkflow = async (input: NotifyInput) => {
  const roles = input.recipientRoles || [];
  const recipients = await resolveTimesheetApproverRecipients({
    employeeCode: input.recipientEmployeeCode,
    nameHint: input.recipientNameHint,
    roles,
  });
  const workspaceLink = toAbsoluteWorkflowHref(approvalHref);
  const periodLabel = input.header?.periodId?.replace(/^per-/, '') || 'current period';

  if (!recipients.length) {
    try {
      await createEnterpriseNotification(systemSession(), {
        kind: 'Approval',
        module: 'Timesheet Approval',
        title: input.title,
        body: input.body,
        severity: input.severity || 'info',
        recipientEmployeeCode: input.recipientEmployeeCode,
        recipientRoles: roles,
        href: approvalHref,
        channels: ['In-App', 'Email'],
        metadata: {
          headerId: input.header?.id || '',
          periodId: input.header?.periodId || '',
          projectCode: input.projectCode || '',
        },
      });
    } catch (error) {
      console.warn('[Timesheet notify] In-app notification failed:', error instanceof Error ? error.message : error);
    }
    return;
  }

  for (const recipient of recipients) {
    try {
      await createEnterpriseNotification(systemSession(), {
        kind: 'Approval',
        module: 'Timesheet Approval',
        title: input.title,
        body: input.body,
        severity: input.severity || 'info',
        recipientEmployeeCode: recipient.employeeCode,
        recipientRoles: [],
        href: approvalHref,
        channels: ['In-App', 'Email'],
        metadata: {
          headerId: input.header?.id || '',
          periodId: input.header?.periodId || '',
          projectCode: input.projectCode || '',
          recipientCode: recipient.employeeCode,
        },
      });
    } catch (error) {
      console.warn('[Timesheet notify] In-app notification failed:', error instanceof Error ? error.message : error);
    }

    if (!recipient.email) continue;
    try {
      await sendTimesheetApprovalRequestEmail({
        recipientName: recipient.fullName,
        recipientEmail: recipient.email,
        stage: input.stageLabel || 'Timesheet approval',
        periodLabel,
        timesheetDate: input.header?.timesheetDate,
        supervisorName: input.header?.supervisorName || input.header?.supervisorId,
        workCenterName: input.header?.workCenterName,
        actorName: input.actorName || 'Timesheet Workflow',
        workspaceLink,
      });
    } catch (error) {
      console.warn('[Timesheet notify] Email failed:', error instanceof Error ? error.message : error);
    }
  }
};

export const notifyTimesheetStageChange = async (input: {
  header: TimesheetHeader;
  action: 'APPROVE' | 'REJECT' | 'RETURN' | 'SUBMIT' | 'LOCK';
  nextStage?: TimesheetWorkflowStage | 'Payroll' | null;
  actor: string;
  comment?: string | null;
  projectCode?: string | null;
}) => {
  const periodLabel = input.header.periodId?.replace(/^per-/, '') || 'current period';
  const projectPart = input.projectCode ? ` (project ${input.projectCode})` : '';
  const actor = input.actor || 'System';
  const supervisorCode = employeeCodeFromLabel(input.header.supervisorId) || employeeCodeFromLabel(input.header.supervisorName);
  const supervisorName = nameFromLabel(input.header.supervisorName) || nameFromLabel(input.header.supervisorId);
  const projectManagerLabel = compact(input.header.projectManager);

  if (input.action === 'SUBMIT') {
    await notifyTimesheetWorkflow({
      title: 'Timesheet submitted for supervisor review',
      body: `${actor} submitted timesheet ${input.header.id} for period ${periodLabel}. Supervisor review can now start.`,
      severity: 'warning',
      recipientRoles: ['Supervisor', 'Foreman', 'Site Lead'],
      recipientEmployeeCode: supervisorCode || undefined,
      recipientNameHint: supervisorName || undefined,
      header: input.header,
      stageLabel: 'Supervisor',
      actorName: actor,
    });
    return;
  }

  if (input.action === 'REJECT' || input.action === 'RETURN') {
    await notifyTimesheetWorkflow({
      title: `Timesheet ${input.action === 'REJECT' ? 'rejected' : 'returned'}${projectPart}`,
      body: `${actor} ${input.action === 'REJECT' ? 'rejected' : 'returned'} timesheet ${input.header.id}${projectPart} for period ${periodLabel}.${input.comment ? ` Comment: ${input.comment}` : ''}`,
      severity: 'warning',
      recipientRoles: ['Supervisor', 'Foreman', 'Site Lead'],
      recipientEmployeeCode: supervisorCode || undefined,
      recipientNameHint: supervisorName || undefined,
      header: input.header,
      projectCode: input.projectCode,
      stageLabel: 'Supervisor',
      actorName: actor,
    });
    return;
  }

  if (input.action === 'LOCK') {
    await notifyTimesheetWorkflow({
      title: 'Timesheet locked for payroll',
      body: `${actor} locked timesheet period ${periodLabel}.`,
      severity: 'success',
      recipientRoles: ['Payroll', 'HR', 'Supervisor'],
      header: input.header,
      stageLabel: 'Payroll',
      actorName: actor,
    });
    return;
  }

  const next = input.nextStage;
  if (next === 'Project Manager') {
    await notifyTimesheetWorkflow({
      title: 'Timesheet ready for project manager review',
      body: `Supervisor approved timesheet ${input.header.id}. Project managers can now review allocated projects for period ${periodLabel}.`,
      severity: 'warning',
      recipientRoles: ['Project Manager'],
      recipientEmployeeCode: employeeCodeFromLabel(projectManagerLabel) || undefined,
      recipientNameHint: nameFromLabel(projectManagerLabel) || undefined,
      header: input.header,
      stageLabel: 'Project Manager',
      actorName: actor,
    });
  } else if (next === 'Cost Control') {
    await notifyTimesheetWorkflow({
      title: 'Timesheet ready for cost control review',
      body: `Project manager approvals progressed on timesheet ${input.header.id}${projectPart}. Cost Control can review period ${periodLabel}.`,
      severity: 'warning',
      recipientRoles: ['Cost Control', 'Finance'],
      header: input.header,
      projectCode: input.projectCode,
      stageLabel: 'Cost Control',
      actorName: actor,
    });
  } else if (next === 'GM Operations') {
    await notifyTimesheetWorkflow({
      title: 'Consolidated timesheet ready for GM Operations',
      body: `All project approvals are complete for period ${periodLabel}. GM Operations can review the consolidated 16th–15th timesheet (all projects).`,
      severity: 'warning',
      recipientRoles: ['GM Operations', 'General Manager', 'Operations'],
      header: input.header,
      stageLabel: 'GM Operations',
      actorName: actor,
    });
  } else if (next === 'HR') {
    await notifyTimesheetWorkflow({
      title: 'Consolidated timesheet ready for HR acknowledgement',
      body: `GM Operations approved the consolidated timesheet for period ${periodLabel}. HR can acknowledge all projects for payroll.`,
      severity: 'warning',
      recipientRoles: ['HR', 'HR Manager', 'Human Resources'],
      header: input.header,
      stageLabel: 'HR',
      actorName: actor,
    });
  } else if (next === 'Payroll') {
    await notifyTimesheetWorkflow({
      title: 'Timesheet acknowledged — ready for payroll',
      body: `HR acknowledged consolidated timesheet for period ${periodLabel}. Payroll can process and lock.`,
      severity: 'success',
      recipientRoles: ['Payroll'],
      header: input.header,
      stageLabel: 'Payroll',
      actorName: actor,
    });
  }
};
