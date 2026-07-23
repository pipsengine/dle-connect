import type { SessionPayload } from '@/lib/auth/session';
import { createEnterpriseNotification } from '@/lib/enterprise-notifications-store';
import { sendTransactionalEmail } from '@/lib/mail-service';
import type { TimesheetHeader, TimesheetWorkflowStage } from '@/lib/timesheet-entry-store';

type NotifyInput = {
  title: string;
  body: string;
  severity?: 'info' | 'success' | 'warning' | 'critical';
  recipientRoles?: string[];
  recipientEmployeeCode?: string;
  header?: TimesheetHeader | null;
  projectCode?: string | null;
  emailTo?: string | string[] | null;
};

const approvalHref = '/hris/time-and-logs/timesheet-approval';

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

const uniqueEmails = (values: Array<string | null | undefined>) =>
  [...new Set(values.map((value) => String(value || '').trim().toLowerCase()).filter((value) => value.includes('@')))];

/**
 * In-app + optional email alert for timesheet stage changes.
 * Role-targeted notifications fan out via recipientRoles (GM, HR, Cost Control, Payroll, etc.).
 */
export const notifyTimesheetWorkflow = async (input: NotifyInput) => {
  try {
    await createEnterpriseNotification(systemSession(), {
      kind: 'Approval',
      module: 'Timesheet Approval',
      title: input.title,
      body: input.body,
      severity: input.severity || 'info',
      recipientEmployeeCode: input.recipientEmployeeCode,
      recipientRoles: input.recipientRoles || [],
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

  const recipients = uniqueEmails(Array.isArray(input.emailTo) ? input.emailTo : [input.emailTo]);
  for (const to of recipients) {
    try {
      await sendTransactionalEmail({
        to,
        subject: input.title,
        text: `${input.body}\n\nOpen approval workspace: ${approvalHref}`,
        html: `<p>${input.body}</p><p><a href="${approvalHref}">Open timesheet approval workspace</a></p>`,
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

  if (input.action === 'SUBMIT') {
    await notifyTimesheetWorkflow({
      title: 'Timesheet submitted for supervisor review',
      body: `${actor} submitted timesheet ${input.header.id} for period ${periodLabel}.`,
      severity: 'info',
      recipientRoles: ['Supervisor', 'Foreman', 'Site Lead'],
      header: input.header,
    });
    return;
  }

  if (input.action === 'REJECT' || input.action === 'RETURN') {
    await notifyTimesheetWorkflow({
      title: `Timesheet ${input.action === 'REJECT' ? 'rejected' : 'returned'}${projectPart}`,
      body: `${actor} ${input.action === 'REJECT' ? 'rejected' : 'returned'} timesheet ${input.header.id}${projectPart} for period ${periodLabel}.${input.comment ? ` Comment: ${input.comment}` : ''}`,
      severity: 'warning',
      recipientRoles: ['Supervisor', 'Foreman', 'Site Lead', 'Cost Control', 'Project Manager'],
      header: input.header,
      projectCode: input.projectCode,
    });
    return;
  }

  if (input.action === 'LOCK') {
    await notifyTimesheetWorkflow({
      title: 'Timesheet locked for payroll',
      body: `${actor} locked timesheet period ${periodLabel}.`,
      severity: 'success',
      recipientRoles: ['Supervisor', 'Payroll', 'HR'],
      header: input.header,
    });
    return;
  }

  const next = input.nextStage;
  if (next === 'Project Manager') {
    await notifyTimesheetWorkflow({
      title: 'Timesheet ready for project manager review',
      body: `Supervisor approved timesheet ${input.header.id}. Project managers can now review allocated projects for period ${periodLabel}.`,
      severity: 'info',
      recipientRoles: ['Project Manager'],
      header: input.header,
    });
  } else if (next === 'Cost Control') {
    await notifyTimesheetWorkflow({
      title: 'Timesheet ready for cost control review',
      body: `Project manager approvals progressed on timesheet ${input.header.id}${projectPart}. Cost Control can review period ${periodLabel}.`,
      severity: 'info',
      recipientRoles: ['Cost Control', 'Finance'],
      header: input.header,
      projectCode: input.projectCode,
    });
  } else if (next === 'GM Operations') {
    await notifyTimesheetWorkflow({
      title: 'Consolidated timesheet ready for GM Operations',
      body: `All project approvals are complete for period ${periodLabel}. GM Operations can review the consolidated 16th–15th timesheet (all projects).`,
      severity: 'info',
      recipientRoles: ['GM Operations', 'General Manager', 'Operations'],
      header: input.header,
    });
  } else if (next === 'HR') {
    await notifyTimesheetWorkflow({
      title: 'Consolidated timesheet ready for HR acknowledgement',
      body: `GM Operations approved the consolidated timesheet for period ${periodLabel}. HR can acknowledge all projects for payroll.`,
      severity: 'info',
      recipientRoles: ['HR', 'HR Manager', 'Human Resources'],
      header: input.header,
    });
  } else if (next === 'Payroll') {
    await notifyTimesheetWorkflow({
      title: 'Timesheet acknowledged — ready for payroll',
      body: `HR acknowledged consolidated timesheet for period ${periodLabel}. Payroll can process and lock.`,
      severity: 'success',
      recipientRoles: ['Payroll', 'Supervisor'],
      header: input.header,
    });
  }
};
