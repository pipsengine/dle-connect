import type { SessionPayload } from '@/lib/auth/session';
import type { DleEmployeeDirectoryRow } from '@/lib/dle-enterprise-db';
import { createEnterpriseNotification } from '@/lib/enterprise-notifications-store';
import {
  sendPaymentApprovalRequestEmail,
  sendPaymentDecisionEmail,
  sendTreasuryPaymentReadyEmail,
  sendTransactionalEmail,
  resolveEmployeeMailbox,
} from '@/lib/mail-service';
import { resolveLineManagerForEmployee, resolveLineManagerOrThrow } from '@/lib/leave-workflow-service';
import { readDirectoryEmployees } from '@/lib/payroll-employee-source';
import { resolveWorkflowLinkOrigin } from '@/lib/public-app-url';
import { readProjects } from '@/lib/timesheet-entry-store';

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
  paymentSiteCode?: string;
  paymentSiteName?: string;
  supervisorName?: string;
  currentStage?: string;
  currentApproverCode?: string | null;
  currentApproverName?: string | null;
  status?: string;
};

/** Treasury officers notified when a payment reaches Ready for Treasury. */
const TREASURY_READY_CONTACTS: Array<{
  code: string;
  email: string;
  /** Empty = all payment sites; otherwise only these site codes. */
  sites: string[];
}> = [
  { code: 'P0385', email: 'ifeanyiemesiana@dormanlongeng.com', sites: [] },
  { code: 'P0387', email: 'omotolaniagboola@dormanlongeng.com', sites: ['DLPC', 'DLPCG'] },
];

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

/** Match directory employee to the Project Manager text stored on the project master. */
const findEmployeeByProjectManagerText = (
  employees: DleEmployeeDirectoryRow[],
  value: string,
): DleEmployeeDirectoryRow | null => {
  const target = compact(value).toLowerCase();
  if (!target) return null;
  const inactive = /inactive|terminated|resigned|retired|deceased|suspend/i;
  const active = employees.filter((employee) => !inactive.test(compact(employee.status)));
  const pool = active.length ? active : employees;

  const exact = pool.find((employee) => {
    const code = employeeCodeOf(employee).toLowerCase();
    const name = compact(employee.fullName).toLowerCase();
    return (code && code === target)
      || (name && name === target)
      || (code && name && `${code} - ${name}` === target)
      || (code && name && `${code} · ${name}` === target);
  });
  if (exact) return exact;

  return pool.find((employee) => {
    const fields = [
      employeeCodeOf(employee),
      employee.employeeId,
      employee.fullName,
      employee.officialEmail,
      employee.email,
    ].map((field) => compact(field).toLowerCase()).filter(Boolean);
    return fields.some((field) => field === target || field.includes(target) || target.includes(field));
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
  const origin = resolveWorkflowLinkOrigin(baseUrl);
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
  /** When true, return the directory principal and skip active delegation. */
  principalOnly?: boolean;
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
    // Strictly the HRIS reporting manager. No supervisor-name or department-head guessing:
    // an unresolved line manager must fail loudly rather than route to the wrong approver.
    if (requester) {
      matched = resolveLineManagerForEmployee(requester, employees)?.employee || null;
    }
  } else if (/project manager/.test(stageKey)) {
    // Source of truth: Project Manager assigned on the project master (TimesheetProjects).
    const projectCode = compact(input.projectCode);
    let assignedPm = '';
    if (projectCode) {
      const projects = await readProjects().catch(() => [] as Awaited<ReturnType<typeof readProjects>>);
      const project = projects.find((item) => compact(item.code).toLowerCase() === projectCode.toLowerCase()) || null;
      assignedPm = compact(project?.projectManager);
      if (assignedPm && !/^unassigned$/i.test(assignedPm)) {
        matched = findEmployeeByProjectManagerText(employees, assignedPm);
        // Do not fall back to an unrelated directory PM when the project already has an assignee.
        if (!matched) {
          return {
            code: '',
            name: assignedPm,
            employee: null,
            roles,
          };
        }
      }
    }
    // Only if the project has no PM assignment, use directory heuristics as last resort.
    if (!matched && !assignedPm) {
      const project = projectCode.toLowerCase();
      matched = employees.find((employee) => {
        if (/inactive|terminated|resigned|retired|deceased|suspend/i.test(compact(employee.status))) return false;
        const title = compact(employee.jobTitle || employee.designation);
        if (!/project\s*manager/i.test(title)) return false;
        if (!project) return true;
        const site = compact(employee.projectSite || employee.department).toLowerCase();
        return site.includes(project) || project.includes(site);
      }) || null;
    }
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
    // Managing Director: Mr CHRIS IJELI (P0413)
    matched = employees.find((employee) => {
      if (/inactive|terminated|resigned|retired|deceased|suspend/i.test(compact(employee.status))) return false;
      return employeeCodeOf(employee).toUpperCase() === 'P0413';
    }) || matchJobTitle(employees, [/managing\s*director/i, /\bmd\s*\/?\s*ceo\b/i, /chief\s*executive/i]);
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
  if (input.principalOnly) return principal;

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

export const isReportingManagerStage = (stage: string) =>
  /reporting manager|line manager|supervisor|lead/i.test(compact(stage));

/**
 * Guard for Reporting Manager stages: throws unless the requester has a real HRIS
 * reporting manager to route to. Call this before persisting or advancing a request
 * so it can never sit with a guessed or missing approver.
 */
export const assertReportingManagerRoutable = async (input: {
  stage: string;
  requesterCode?: string | null;
  requesterName?: string | null;
}) => {
  if (!isReportingManagerStage(input.stage)) return;

  const directory = await readDirectoryEmployees().catch(() => ({ employees: [] as DleEmployeeDirectoryRow[] }));
  const employees = directory.employees || [];
  const target = compact(input.requesterCode).toUpperCase();
  const requester = employees.find((employee) => {
    if (!target) return false;
    return employeeCodeOf(employee).toUpperCase() === target
      || compact(employee.employeeId).toUpperCase() === target;
  }) || null;

  if (!requester) {
    const label = compact(input.requesterName) || compact(input.requesterCode) || 'the requester';
    throw new Error(`${label} was not found in the HRIS employee directory, so the Reporting Manager approval cannot be routed. Ask HR to confirm the employee record.`);
  }

  resolveLineManagerOrThrow(requester, employees);
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
  const linkOrigin = resolveWorkflowLinkOrigin(input.baseUrl);
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
        approveUrl: paymentRequestDetailUrl(input.request.requestId, linkOrigin, 'approve'),
        rejectUrl: paymentRequestDetailUrl(input.request.requestId, linkOrigin, 'reject'),
        detailUrl: paymentRequestDetailUrl(input.request.requestId, linkOrigin),
        baseUrl: linkOrigin,
      });
      console.info('[payment-approval] approver email result', {
        to: mailbox,
        code: approver.code,
        requestNumber: input.request.requestNumber,
        stage: input.stage,
        linkOrigin,
        sent: result.sent,
        reason: result.reason || null,
      });
      if (!result.sent) {
        throw new Error(result.reason || 'Payment approval email was not sent.');
      }
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

/** Email Treasury when final approval completes (Ready for Treasury). */
export const notifyTreasuryReadyForPayment = async (input: {
  request: PaymentNotifyRequest;
  actorName: string;
  baseUrl?: string | null;
}) => {
  const session = financeSystemSession(input.actorName);
  const directory = await readDirectoryEmployees().catch(() => ({ employees: [] as DleEmployeeDirectoryRow[] }));
  const employees = directory.employees || [];
  const site = compact(input.request.paymentSiteCode).toUpperCase();
  const detailUrl = paymentRequestDetailUrl(input.request.requestId, input.baseUrl);
  const treasuryHref = '/finance/approvals/treasury';

  await safeNotify('treasury ready in-app', async () => {
    await createEnterpriseNotification(session, {
      kind: 'Approval',
      module: 'Finance Approvals',
      title: 'Payment ready for Treasury',
      body: `${input.request.requestNumber} is fully approved and ready for payment.`,
      severity: 'warning',
      recipientRoles: ['Treasury Officer', 'Finance Manager', 'Finance Controller', 'Accountant'],
      href: treasuryHref,
      channels: ['In-App'],
      metadata: { requestId: input.request.requestId, event: 'treasury-ready' },
      actor: input.actorName,
    });
  });

  for (const contact of TREASURY_READY_CONTACTS) {
    if (contact.sites.length > 0 && !contact.sites.includes(site)) continue;

    const employee = employees.find((row) => employeeCodeOf(row).toUpperCase() === contact.code) || null;
    const mailbox = (await resolveEmployeeMailbox(employee).catch(() => null)) || contact.email;
    const recipientName = compact(employee?.fullName) || contact.code;

    await safeNotify(`treasury ready email ${contact.code}`, () =>
      sendTreasuryPaymentReadyEmail({
        recipientName,
        recipientEmail: mailbox,
        request: input.request,
        actorName: input.actorName,
        detailUrl,
        baseUrl: input.baseUrl,
      }));
  }
};

export const notifyPaymentClarificationComment = async (input: {
  request: PaymentNotifyRequest;
  actorName: string;
  actorCode: string;
  comment: string;
  recipientCode: string;
  recipientName?: string;
  baseUrl?: string | null;
}) => {
  const recipientCode = compact(input.recipientCode);
  const actorCode = compact(input.actorCode);
  if (!recipientCode) return;
  if (actorCode && recipientCode.toUpperCase() === actorCode.toUpperCase()) return;

  const session = financeSystemSession(input.actorName);
  const href = `${paymentRequestDetailPath(input.request.requestId)}#payment-comments`;
  const preview = compact(input.comment).slice(0, 280);
  const title = `Clarification on ${input.request.requestNumber}`;
  const body = `${input.actorName} commented on ${input.request.requestNumber}: ${preview}`;

  await safeNotify('clarification in-app', async () => {
    await createEnterpriseNotification(session, {
      kind: 'Message',
      module: 'Finance Approvals',
      title,
      body,
      severity: 'info',
      recipientEmployeeCode: recipientCode,
      href,
      channels: ['In-App', 'Email'],
      metadata: {
        requestId: input.request.requestId,
        requestNumber: input.request.requestNumber,
        event: 'clarification-comment',
      },
      actor: input.actorName,
    });
  });

  const directory = await readDirectoryEmployees().catch(() => ({ employees: [] as DleEmployeeDirectoryRow[] }));
  const recipientTarget = recipientCode.toUpperCase();
  const recipient = (directory.employees || []).find((employee) => {
    const code = employeeCodeOf(employee).toUpperCase();
    return code === recipientTarget || compact(employee.employeeId).toUpperCase() === recipientTarget;
  }) || null;
  let mailbox = recipient ? await resolveEmployeeMailbox(recipient) : '';
  if (!mailbox) {
    mailbox = await resolveEmployeeMailbox({
      employeeCode: recipientCode,
      employeeId: recipientCode,
      sourceEmployeeId: recipientCode,
      fullName: input.recipientName || recipientCode,
    } as DleEmployeeDirectoryRow);
  }
  if (!mailbox) return;

  const detailUrl = `${resolveWorkflowLinkOrigin(input.baseUrl)}${href}`;
  const recipientName = compact(input.recipientName) || compact(recipient?.fullName) || recipientCode;
  await safeNotify('clarification email', () => sendTransactionalEmail({
    to: mailbox,
    subject: `${input.request.requestNumber}: clarification from ${input.actorName}`,
    text: [
      `Hello ${recipientName},`,
      '',
      `${input.actorName} posted a clarification comment on ${input.request.paymentType} ${input.request.requestNumber}.`,
      '',
      input.comment,
      '',
      `The payment remains at ${input.request.currentStage || 'the current approval stage'} until it is approved, returned, or rejected.`,
      `Open the request: ${detailUrl}`,
    ].join('\n'),
    html: `
      <p>Hello ${recipientName},</p>
      <p><strong>${input.actorName}</strong> posted a clarification comment on ${input.request.paymentType} <strong>${input.request.requestNumber}</strong>.</p>
      <blockquote style="margin:16px 0;padding:12px 16px;border-left:4px solid #008FD5;background:#F8FAFC;white-space:pre-wrap;">${input.comment.replace(/</g, '&lt;')}</blockquote>
      <p>The payment remains at ${input.request.currentStage || 'the current approval stage'} until it is approved, returned, or rejected.</p>
      <p><a href="${detailUrl}">Open the request and reply</a></p>
    `,
  }));
};

export const notifyPaymentDecision = async (input: {
  request: PaymentNotifyRequest;
  event: 'approved' | 'rejected' | 'returned' | 'cancelled' | 'stage-advanced' | 'paid' | 'posted' | 'retirement-submitted' | 'retirement-acknowledged';
  actorName: string;
  stage?: string;
  nextStage?: string;
  reason?: string;
  baseUrl?: string | null;
}) => {
  const session = financeSystemSession(input.actorName);
  const directory = await readDirectoryEmployees().catch(() => ({ employees: [] as DleEmployeeDirectoryRow[] }));
  const requesterTarget = compact(input.request.requesterCode).toUpperCase();
  const requesterNameTarget = compact(input.request.requesterName).toLowerCase();
  const requester = (directory.employees || []).find((employee) => {
    const code = employeeCodeOf(employee).toUpperCase();
    if (requesterTarget && (code === requesterTarget || compact(employee.employeeId).toUpperCase() === requesterTarget)) {
      return true;
    }
    if (!requesterTarget && requesterNameTarget) {
      return compact(employee.fullName).toLowerCase() === requesterNameTarget;
    }
    return false;
  }) || null;

  const titles: Record<typeof input.event, string> = {
    approved: 'Payment request approved',
    rejected: 'Payment request rejected',
    returned: 'Payment request returned',
    cancelled: 'Payment will not be paid',
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
    cancelled: 'warning',
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
              : input.event === 'cancelled'
                ? `${input.request.requestNumber} will not be paid. Treasury closed it without disbursement.${input.reason ? ` Reason: ${input.reason}` : ''} Do not reuse this request number.`
                : `${input.request.requestNumber} was ${input.event} by ${input.actorName}.${input.reason ? ` Reason: ${input.reason}` : ''}`;

  const href = paymentRequestDetailPath(input.request.requestId);
  const shouldNotifyRequester = input.event !== 'posted' && input.event !== 'retirement-submitted';

  if (shouldNotifyRequester) {
    const recipientCode = (requester ? employeeCodeOf(requester) : '') || requesterTarget;
    if (recipientCode) {
      await safeNotify('requester in-app', async () => {
        await createEnterpriseNotification(session, {
          kind: 'Approval',
          module: 'Finance Approvals',
          title: titles[input.event],
          body,
          severity: severity[input.event],
          recipientEmployeeCode: recipientCode,
          href,
          channels: ['In-App', 'Email'],
          metadata: { requestId: input.request.requestId, event: input.event },
          actor: input.actorName,
        });
      });
    }

    // Always attempt email on return/reject (and other requester events), even if directory row is missing.
    let mailbox = requester ? await resolveEmployeeMailbox(requester) : '';
    if (!mailbox && requesterTarget) {
      mailbox = await resolveEmployeeMailbox({
        employeeCode: requesterTarget,
        employeeId: requesterTarget,
        sourceEmployeeId: requesterTarget,
        fullName: input.request.requesterName,
      } as DleEmployeeDirectoryRow);
    }
    if (mailbox) {
      await safeNotify('requester email', () =>
        sendPaymentDecisionEmail({
          recipientName: compact(requester?.fullName) || input.request.requesterName,
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
    } else if (input.event === 'rejected' || input.event === 'returned' || input.event === 'cancelled') {
      console.warn('[payment-approval] requester email skipped — no mailbox', {
        requestId: input.request.requestId,
        requesterCode: input.request.requesterCode,
        event: input.event,
      });
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

  if (input.event === 'approved') {
    await notifyTreasuryReadyForPayment({
      request: input.request,
      actorName: input.actorName,
      baseUrl: input.baseUrl,
    }).catch((error) => console.error('[payment-approval] treasury ready notify failed', error));
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
