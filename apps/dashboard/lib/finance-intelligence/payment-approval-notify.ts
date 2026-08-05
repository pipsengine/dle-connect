import type { SessionPayload } from '@/lib/auth/session';
import type { DleEmployeeDirectoryRow } from '@/lib/dle-enterprise-db';
import { createEnterpriseNotification } from '@/lib/enterprise-notifications-store';
import {
  sendPaymentApprovalRequestEmail,
  sendPaymentDecisionEmail,
  resolveEmployeeMailbox,
} from '@/lib/mail-service';
import { resolveLineManagerForEmployee } from '@/lib/leave-workflow-service';
import { readDirectoryEmployees } from '@/lib/payroll-employee-source';
import { resolvePublicAppOrigin } from '@/lib/public-app-url';

export type PaymentNotifyRequest = {
  requestId: string;
  requestNumber: string;
  paymentType: string;
  title: string;
  requesterCode: string;
  requesterName: string;
  beneficiaryName: string;
  netAmount: number;
  currencyCode: string;
  department?: string;
  projectCode?: string;
  paymentSiteName?: string;
  supervisorName?: string;
  currentStage?: string;
  currentApproverCode?: string | null;
  currentApproverName?: string | null;
  status?: string;
};

export type ResolvedPaymentApprover = {
  code: string;
  name: string;
  employee: DleEmployeeDirectoryRow | null;
  roles: string[];
  delegatedFrom?: { code: string; name: string; delegationId: string };
};

const compact = (value: unknown) => String(value ?? '').trim();

const financeSystemSession = (actor: string): SessionPayload => ({
  sub: 'system-finance-workflow',
  username: 'system-finance-workflow',
  fullName: actor || 'Finance Workflow',
  roles: ['System'],
  permissions: ['*'],
  status: 'Active',
  firstLoginRequired: false,
  passwordResetRequired: false,
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + 3600,
});

const employeeCodeOf = (employee: DleEmployeeDirectoryRow) =>
  compact(employee.employeeCode || employee.employeeId || employee.sourceEmployeeId);

const matchJobTitle = (employees: DleEmployeeDirectoryRow[], patterns: RegExp[]) => {
  const inactive = /inactive|terminated|resigned|retired|deceased|suspend/i;
  return employees.find((employee) => {
    if (inactive.test(compact(employee.status))) return false;
    const title = compact(employee.jobTitle || employee.designation);
    return patterns.some((pattern) => pattern.test(title));
  }) || null;
};

const roleFallbacksForStage = (stage: string): string[] => {
  const value = compact(stage).toLowerCase();
  if (/reporting manager|line manager|supervisor|lead/.test(value)) {
    return ['Line Manager', 'Supervisor', 'Lead', 'Department Head'];
  }
  if (/project manager/.test(value)) return ['Project Manager'];
  if (/cost controller/.test(value)) return ['Cost Controller'];
  if (/finance manager/.test(value)) return ['Finance Manager', 'Finance Controller'];
  if (/^gm$|general manager/.test(value)) return ['General Manager', 'GM'];
  if (/cfo|chief financial/.test(value)) return ['CFO', 'Chief Financial Officer'];
  if (/md\/?ceo|managing director|chief executive/.test(value)) return ['MD', 'CEO', 'Managing Director'];
  return [compact(stage) || 'Finance Approver'];
};

export const paymentRequestDetailPath = (requestId: string) =>
  `/finance/approvals/request/${encodeURIComponent(requestId)}`;

export const paymentRequestDetailUrl = (requestId: string, baseUrl?: string | null, action?: 'approve' | 'reject') => {
  const origin = resolvePublicAppOrigin(baseUrl);
  const path = paymentRequestDetailPath(requestId);
  if (!action) return `${origin}${path}`;
  return `${origin}${path}?action=${action}`;
};

export const resolvePaymentStageApprover = async (input: {
  stage: string;
  requesterCode?: string | null;
  projectCode?: string | null;
  supervisorName?: string | null;
  paymentType?: string | null;
}): Promise<ResolvedPaymentApprover & { delegatedFrom?: { code: string; name: string; delegationId: string } }> => {
  const stage = compact(input.stage) || 'Finance Manager';
  const roles = roleFallbacksForStage(stage);
  const directory = await readDirectoryEmployees().catch(() => ({ employees: [] as DleEmployeeDirectoryRow[] }));
  const employees = directory.employees || [];
  const requester = employees.find((employee) => {
    const code = employeeCodeOf(employee).toUpperCase();
    const target = compact(input.requesterCode).toUpperCase();
    return target && (code === target || compact(employee.employeeId).toUpperCase() === target);
  }) || null;

  let matched: DleEmployeeDirectoryRow | null = null;
  const stageKey = stage.toLowerCase();

  if (/reporting manager|line manager|supervisor|lead/.test(stageKey)) {
    if (requester) {
      matched = resolveLineManagerForEmployee(requester, employees)?.employee || null;
    }
    if (!matched && compact(input.supervisorName)) {
      matched = employees.find((employee) =>
        compact(employee.fullName).toLowerCase() === compact(input.supervisorName).toLowerCase()) || null;
    }
  } else if (/project manager/.test(stageKey)) {
    const project = compact(input.projectCode).toLowerCase();
    matched = employees.find((employee) => {
      const title = compact(employee.jobTitle || employee.designation);
      if (!/project\s*manager/i.test(title)) return false;
      if (!project) return true;
      const site = compact(employee.projectSite || employee.department).toLowerCase();
      return site.includes(project) || project.includes(site);
    }) || matchJobTitle(employees, [/project\s*manager/i]);
  } else if (/cost controller/.test(stageKey)) {
    matched = matchJobTitle(employees, [/cost\s*controller/i]);
  } else if (/finance manager/.test(stageKey)) {
    // Acting Finance Manager (temporary): Rapheal/Raphael Iyanda until a permanent FM job title is set.
    // HRIS spelling is RAPHEAL OLAITAN IYANDA (P0429).
    matched = employees.find((employee) => {
      if (/inactive|terminated|resigned|retired|deceased|suspend/i.test(compact(employee.status))) return false;
      const name = compact(employee.fullName);
      const code = employeeCodeOf(employee).toUpperCase();
      if (code === 'P0429') return true;
      return /iyanda/i.test(name) && /raphael|rapheal|olaitan/i.test(name);
    }) || null;
    if (!matched) {
      matched = matchJobTitle(employees, [/finance\s*manager/i, /financial\s*controller/i]);
    }
  } else if (/^gm$|general manager/.test(stageKey)) {
    matched = matchJobTitle(employees, [/^gm$/i, /general\s*manager/i]);
  } else if (/cfo|chief financial/.test(stageKey)) {
    matched = matchJobTitle(employees, [/\bcfo\b/i, /chief\s*financial/i]);
  } else if (/md\/?ceo|managing director|chief executive/.test(stageKey)) {
    matched = matchJobTitle(employees, [/managing\s*director/i, /\bmd\b/i, /\bceo\b/i, /chief\s*executive/i]);
  }

  const principal = matched
    ? {
      code: employeeCodeOf(matched),
      name: compact(matched.fullName) || stage,
      employee: matched,
      roles,
    }
    : {
      code: '',
      name: stage,
      employee: null,
      roles,
    };

  if (!principal.code && !principal.name) return principal;

  try {
    const { resolveActiveDelegation } = await import('@/lib/finance-intelligence/approval-delegation-service');
    const delegation = await resolveActiveDelegation({
      fromEmployeeCode: principal.code || null,
      fromEmployeeName: principal.name || null,
      stage,
      paymentType: input.paymentType,
    });
    if (!delegation) return principal;

    const delegate = employees.find((employee) => {
      const code = employeeCodeOf(employee).toUpperCase();
      return code === delegation.toEmployeeCode.toUpperCase()
        || compact(employee.employeeId).toUpperCase() === delegation.toEmployeeCode.toUpperCase();
    }) || null;

    return {
      code: delegation.toEmployeeCode || (delegate ? employeeCodeOf(delegate) : ''),
      name: delegation.toEmployeeName
        || (delegate ? compact(delegate.fullName) : '')
        || `Delegate for ${principal.name}`,
      employee: delegate,
      roles,
      delegatedFrom: {
        code: principal.code,
        name: principal.name,
        delegationId: delegation.delegationId,
      },
    };
  } catch (error) {
    console.error('[payment-approval] delegation lookup failed', error);
    return principal;
  }
};

const safeNotify = async (label: string, task: () => Promise<unknown>) => {
  try {
    await task();
  } catch (error) {
    console.error(`[payment-approval] ${label} failed`, error);
  }
};

export const notifyPaymentApprovalRequired = async (input: {
  request: PaymentNotifyRequest;
  stage: string;
  actorName: string;
  baseUrl?: string | null;
}) => {
  const session = financeSystemSession(input.actorName);
  const resolved = await resolvePaymentStageApprover({
    stage: input.stage,
    requesterCode: input.request.requesterCode,
    projectCode: input.request.projectCode,
    supervisorName: input.request.supervisorName,
    paymentType: input.request.paymentType,
  });
  // Prefer the assignee already persisted on the request (set by assignCurrentApprover).
  const assignedCode = compact(input.request.currentApproverCode);
  const assignedName = compact(input.request.currentApproverName).replace(/\s*\(Delegated.*$/i, '');
  const approver = assignedCode
    ? {
      ...resolved,
      code: assignedCode,
      name: assignedName || resolved.name,
    }
    : resolved;
  const href = paymentRequestDetailPath(input.request.requestId);
  const amountLabel = `${input.request.currencyCode} ${Number(input.request.netAmount || 0).toLocaleString('en-NG')}`;
  const body = `${input.request.requesterName} submitted ${input.request.paymentType} ${input.request.requestNumber} (${amountLabel}) for ${input.stage} approval.`;

  await safeNotify('approver in-app', async () => {
    const created = await createEnterpriseNotification(session, {
      kind: 'Approval',
      module: 'Finance Approvals',
      title: 'Payment approval required',
      body,
      severity: 'warning',
      recipientEmployeeCode: approver.code || undefined,
      recipientRoles: approver.code ? [] : approver.roles,
      href,
      channels: ['In-App', 'Email'],
      metadata: {
        requestId: input.request.requestId,
        requestNumber: input.request.requestNumber,
        stage: input.stage,
        recipientCode: approver.code || '',
        recipientName: approver.name || '',
      },
      actor: input.actorName,
    });
    console.info('[payment-approval] in-app notification created', {
      id: created.id,
      recipientEmployeeCode: created.recipientEmployeeCode,
      requestNumber: input.request.requestNumber,
      stage: input.stage,
    });
  });

  const directoryEmployees = (await readDirectoryEmployees().catch(() => ({ employees: [] as DleEmployeeDirectoryRow[] }))).employees || [];
  const employee = approver.employee
    || directoryEmployees.find((row) => employeeCodeOf(row).toUpperCase() === compact(approver.code).toUpperCase())
    || null;
  // Resolve mailbox even when directory row is thin — fall back to auth user email by employee code.
  let mailbox = employee ? await resolveEmployeeMailbox(employee) : '';
  if (!mailbox && approver.code) {
    mailbox = await resolveEmployeeMailbox({
      employeeCode: approver.code,
      employeeId: approver.code,
      fullName: approver.name,
    } as DleEmployeeDirectoryRow);
  }
  if (mailbox) {
    await safeNotify('approver email', async () => {
      const result = await sendPaymentApprovalRequestEmail({
        recipientName: approver.name,
        recipientEmail: mailbox,
        request: input.request,
        stage: input.stage,
        approveUrl: paymentRequestDetailUrl(input.request.requestId, input.baseUrl, 'approve'),
        rejectUrl: paymentRequestDetailUrl(input.request.requestId, input.baseUrl, 'reject'),
        detailUrl: paymentRequestDetailUrl(input.request.requestId, input.baseUrl),
        baseUrl: input.baseUrl,
      });
      console.info('[payment-approval] approver email result', {
        to: mailbox,
        code: approver.code,
        requestNumber: input.request.requestNumber,
        stage: input.stage,
        sent: result.sent,
        reason: result.reason || null,
      });
    });
  } else {
    console.warn('[payment-approval] no mailbox for approver', {
      code: approver.code,
      name: approver.name,
      requestNumber: input.request.requestNumber,
      stage: input.stage,
    });
  }

  return approver;
};

export const notifyPaymentDecision = async (input: {
  request: PaymentNotifyRequest;
  event: 'approved' | 'rejected' | 'returned' | 'stage-advanced' | 'paid' | 'posted' | 'retirement-submitted' | 'retirement-acknowledged';
  actorName: string;
  stage?: string;
  nextStage?: string;
  reason?: string;
  baseUrl?: string | null;
}) => {
  const session = financeSystemSession(input.actorName);
  const directory = await readDirectoryEmployees().catch(() => ({ employees: [] as DleEmployeeDirectoryRow[] }));
  const requester = (directory.employees || []).find((employee) => {
    const code = employeeCodeOf(employee).toUpperCase();
    const target = compact(input.request.requesterCode).toUpperCase();
    return target && (code === target || compact(employee.employeeId).toUpperCase() === target);
  }) || null;

  const titles: Record<typeof input.event, string> = {
    approved: 'Payment request approved',
    rejected: 'Payment request rejected',
    returned: 'Payment request returned',
    'stage-advanced': 'Payment approval progressed',
    paid: 'Payment disbursed',
    posted: 'Payment marked posted',
    'retirement-submitted': 'Cash advance retirement submitted',
    'retirement-acknowledged': 'Cash advance retirement acknowledged',
  };
  const severity: Record<typeof input.event, 'info' | 'success' | 'warning' | 'critical'> = {
    approved: 'success',
    rejected: 'critical',
    returned: 'warning',
    'stage-advanced': 'info',
    paid: 'success',
    posted: 'info',
    'retirement-submitted': 'warning',
    'retirement-acknowledged': 'success',
  };
  const body = input.event === 'stage-advanced'
    ? `${input.request.requestNumber} cleared ${input.stage || 'prior stage'}. Now awaiting ${input.nextStage || 'next stage'}.`
    : input.event === 'approved'
      ? `${input.request.requestNumber} is fully approved and ready for treasury hand-off.`
      : input.event === 'paid'
        ? `${input.request.requestNumber} has been paid by Treasury.${input.reason ? ` ${input.reason}` : ''}`
        : input.event === 'posted'
          ? `${input.request.requestNumber} was marked posted by ${input.actorName} and cleared from the Finance Posting Desk.${input.reason ? ` ${input.reason}` : ''}`
          : input.event === 'retirement-submitted'
            ? `${input.request.requestNumber} retirement was submitted by ${input.actorName} and is awaiting Treasury verification.${input.reason ? ` ${input.reason}` : ''}`
            : input.event === 'retirement-acknowledged'
              ? `${input.request.requestNumber} retirement was acknowledged by Treasury. The advance is now closed.${input.reason ? ` ${input.reason}` : ''}`
              : `${input.request.requestNumber} was ${input.event} by ${input.actorName}.${input.reason ? ` Reason: ${input.reason}` : ''}`;

  const href = paymentRequestDetailPath(input.request.requestId);

  if (requester && input.event !== 'posted' && input.event !== 'retirement-submitted') {
    await safeNotify('requester in-app', async () => {
      await createEnterpriseNotification(session, {
        kind: 'Approval',
        module: 'Finance Approvals',
        title: titles[input.event],
        body,
        severity: severity[input.event],
        recipientEmployeeCode: employeeCodeOf(requester),
        href,
        channels: ['In-App', 'Email'],
        metadata: { requestId: input.request.requestId, event: input.event },
        actor: input.actorName,
      });
    });

    const mailbox = await resolveEmployeeMailbox(requester);
    if (mailbox) {
      await safeNotify('requester email', () =>
        sendPaymentDecisionEmail({
          recipientName: compact(requester.fullName) || input.request.requesterName,
          recipientEmail: mailbox,
          request: input.request,
          event: input.event === 'stage-advanced' ? 'stage-advanced'
            : input.event === 'retirement-acknowledged' ? 'approved'
              : input.event === 'retirement-submitted' ? 'stage-advanced'
                : input.event,
          actorName: input.actorName,
          stage: input.stage,
          nextStage: input.nextStage,
          reason: input.reason || body,
          detailUrl: paymentRequestDetailUrl(input.request.requestId, input.baseUrl),
          baseUrl: input.baseUrl,
        }));
    }
  }

  if (input.event === 'retirement-submitted') {
    await safeNotify('treasury retirement in-app', async () => {
      await createEnterpriseNotification(session, {
        kind: 'Approval',
        module: 'Finance Approvals',
        title: titles['retirement-submitted'],
        body,
        severity: 'warning',
        recipientRoles: ['Treasury Officer', 'Finance Manager', 'Finance Controller', 'Finance Administrator', 'Accountant'],
        href: '/finance/approvals/treasury',
        channels: ['In-App'],
        metadata: { requestId: input.request.requestId, event: input.event },
        actor: input.actorName,
      });
    });
  }

  if (input.event === 'posted') {
    await safeNotify('finance posting in-app', async () => {
      await createEnterpriseNotification(session, {
        kind: 'Approval',
        module: 'Finance Approvals',
        title: titles.posted,
        body,
        severity: 'info',
        recipientRoles: ['Finance Manager', 'Finance Controller', 'Accountant', 'Finance Administrator'],
        href,
        channels: ['In-App'],
        metadata: { requestId: input.request.requestId, event: input.event },
        actor: input.actorName,
      });
    });
  }

  if (input.event === 'stage-advanced' && input.nextStage) {
    await notifyPaymentApprovalRequired({
      request: { ...input.request, currentStage: input.nextStage, status: 'Pending Approval' },
      stage: input.nextStage,
      actorName: input.actorName,
      baseUrl: input.baseUrl,
    });
  }
};
