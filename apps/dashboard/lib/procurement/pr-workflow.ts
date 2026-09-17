import type { SessionPayload } from '@/lib/auth/session';
import { canApproveProcurement } from '@/lib/access/procurement-access';
import { readUsers } from '@/lib/auth/auth-store';
import { createEnterpriseNotification } from '@/lib/enterprise-notifications-store';
import { resolveEmployeeMailbox, sendTransactionalEmail } from '@/lib/mail-service';
import { readEmployeeDirectoryFromDb, type DleEmployeeDirectoryRow } from '@/lib/dle-enterprise-db';
import {
  resolveLineManagerOrThrow,
  resolveLineManagerForEmployee,
} from '@/lib/leave-workflow-service';
import { resolveWorkflowLinkOrigin } from '@/lib/public-app-url';
import {
  listPurchaseRequisitions,
  upsertPurchaseRequisition,
} from '@/lib/procurement-store';

export const PR_STAGE_LINE_MANAGER = 'Line Manager Review';
export const PR_STAGE_PROCUREMENT_MANAGER = 'Procurement Manager Review';
export const PR_STAGE_APPROVED = 'Approved';

export type PrWorkflowEvent = {
  at: string;
  action: string;
  actor: string;
  actorCode?: string;
  stage?: string;
  comment?: string;
};

export type PrBuyerOption = {
  code: string;
  name: string;
  department: string;
};

const compact = (value: unknown) => String(value ?? '').trim();
const upper = (value: unknown) => compact(value).toUpperCase();
const nowIso = () => new Date().toISOString();

const employeeCodeOf = (employee: DleEmployeeDirectoryRow) =>
  compact(employee.employeeCode || employee.employeeId || employee.sourceEmployeeId);

const codesMatch = (left?: string | null, right?: string | null) => {
  const a = upper(left).replace(/[^A-Z0-9]/g, '');
  const b = upper(right).replace(/[^A-Z0-9]/g, '');
  return Boolean(a && b && a === b);
};

const parseWorkflow = (value: unknown): PrWorkflowEvent[] => {
  if (Array.isArray(value)) return value as PrWorkflowEvent[];
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const inactive = (status?: string | null) =>
  /inactive|terminated|resigned|retired|deceased|suspend/i.test(compact(status));

const findEmployee = (employees: DleEmployeeDirectoryRow[], reference?: string | null) => {
  const target = compact(reference);
  if (!target) return null;
  const needle = target.toLowerCase();
  const code = upper(target).replace(/[^A-Z0-9]/g, '');
  return employees.find((employee) => {
    if (inactive(employee.status)) return false;
    const empCode = upper(employeeCodeOf(employee)).replace(/[^A-Z0-9]/g, '');
    const name = compact(employee.fullName).toLowerCase();
    return (code && empCode === code) || (name && (name === needle || name.includes(needle) || needle.includes(name)));
  }) || null;
};

const sessionIsSuper = (session: SessionPayload) =>
  Boolean(session.isGlobalAdmin) || (session.roles || []).some((role) => /super administrator|system administrator/i.test(role));

const sessionIsProcurementManager = (session: SessionPayload, permissions: string[]) =>
  sessionIsSuper(session)
  || (session.roles || []).some((role) => /^procurement manager$/i.test(compact(role)))
  || canApproveProcurement(permissions, session.isGlobalAdmin);

const appendEvent = (existing: unknown, event: PrWorkflowEvent) => [...parseWorkflow(existing), event];

const prHref = () => '/procurement/purchase-requisitions';

const notifyPerson = async (input: {
  actor: string;
  employee?: DleEmployeeDirectoryRow | null;
  code?: string;
  name?: string;
  title: string;
  body: string;
  prId: string;
}) => {
  const href = prHref();
  await createEnterpriseNotification({
    sub: 'system-pr-workflow',
    username: 'system-pr-workflow',
    fullName: input.actor,
    roles: ['System'],
    permissions: ['*'],
    status: 'Active',
    firstLoginRequired: false,
    passwordResetRequired: false,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
    employeeCode: input.code,
  }, {
    kind: 'Approval',
    module: 'Procurement',
    title: input.title,
    body: input.body,
    severity: 'warning',
    recipientEmployeeCode: input.code || employeeCodeOf(input.employee || ({} as DleEmployeeDirectoryRow)) || undefined,
    href,
    channels: ['In-App', 'Email'],
    metadata: { prId: input.prId, recipientName: input.name || input.employee?.fullName || '' },
    actor: input.actor,
  }).catch((error) => console.error('[pr-workflow] in-app notification failed', error));

  const mailbox = input.employee ? await resolveEmployeeMailbox(input.employee).catch(() => '') : '';
  if (!mailbox) return;
  await sendTransactionalEmail({
    to: mailbox,
    subject: input.title,
    text: `${input.body}\n\nOpen: ${resolveWorkflowLinkOrigin()}${href}`,
    html: `<p>${input.body}</p><p><a href="${resolveWorkflowLinkOrigin()}${href}">Open purchase requisition</a></p>`,
  }).catch((error) => console.error('[pr-workflow] email failed', error));
};

export const listProcurementBuyers = async (): Promise<PrBuyerOption[]> => {
  const [employees, users] = await Promise.all([
    readEmployeeDirectoryFromDb().catch(() => [] as DleEmployeeDirectoryRow[]),
    readUsers().catch(() => [] as Awaited<ReturnType<typeof readUsers>>),
  ]);
  const officerCodes = new Set(
    (users || [])
      .filter((user) => user.status === 'Active' && (user.roles || []).some((role) => /procurement officer|procurement manager|procurement administrator/i.test(compact(role))))
      .map((user) => upper(user.employeeCode || user.employeeId || user.username)),
  );
  const options = new Map<string, PrBuyerOption>();
  for (const employee of employees || []) {
    if (inactive(employee.status)) continue;
    const code = employeeCodeOf(employee);
    if (!code) continue;
    const inProcurement = /procurement/i.test(compact(employee.department));
    if (!inProcurement && !officerCodes.has(upper(code))) continue;
    options.set(upper(code), { code, name: employee.fullName, department: employee.department || 'Procurement' });
  }
  return [...options.values()].sort((a, b) => a.name.localeCompare(b.name));
};

export const listProcurementManagers = async () => {
  const [employees, users] = await Promise.all([
    readEmployeeDirectoryFromDb().catch(() => [] as DleEmployeeDirectoryRow[]),
    readUsers().catch(() => [] as Awaited<ReturnType<typeof readUsers>>),
  ]);
  const managers: DleEmployeeDirectoryRow[] = [];
  for (const user of users || []) {
    if (user.status && user.status !== 'Active') continue;
    if (!(user.roles || []).some((role) => /^procurement manager$/i.test(compact(role)))) continue;
    const match = findEmployee(employees || [], user.employeeCode || user.employeeId || user.fullName);
    if (match) managers.push(match);
  }
  if (!managers.length) {
    for (const employee of employees || []) {
      if (inactive(employee.status)) continue;
      if (!/procurement/i.test(compact(employee.department))) continue;
      if (!/manager|head/i.test(compact(employee.jobTitle || employee.designation))) continue;
      managers.push(employee);
    }
  }
  const unique = new Map<string, DleEmployeeDirectoryRow>();
  for (const manager of managers) unique.set(upper(employeeCodeOf(manager)), manager);
  return [...unique.values()];
};

const loadPr = async (prId: string) => {
  const rows = await listPurchaseRequisitions();
  const pr = rows.find((row) => compact(row.prId) === compact(prId));
  if (!pr) throw new Error('Purchase requisition not found.');
  return pr;
};

export const buildPrWorkflowContext = async (session: SessionPayload, permissions: string[]) => ({
  actor: session.fullName || session.username,
  actorCode: session.employeeCode || '',
  isProcurementManager: sessionIsProcurementManager(session, permissions),
  isSuper: sessionIsSuper(session),
  buyers: await listProcurementBuyers(),
});

export const submitPurchaseRequisition = async (prId: string, session: SessionPayload, comment?: string) => {
  const pr = await loadPr(prId);
  const status = compact(pr.status);
  if (!/^(draft|returned|submitted)$/i.test(status)) {
    throw new Error(`PR ${pr.prId} cannot be submitted from status ${status}.`);
  }
  const employees = (await readEmployeeDirectoryFromDb()) || [];
  const requester = findEmployee(employees, pr.requesterCode || session.employeeCode || pr.requesterName);
  if (!requester) throw new Error('Requester could not be matched to an HRIS employee. Set the requester before submitting.');
  const manager = resolveLineManagerOrThrow(requester, employees);
  const workflow = appendEvent(pr.workflow, {
    at: nowIso(),
    action: 'Submitted',
    actor: session.fullName || session.username,
    actorCode: session.employeeCode,
    stage: PR_STAGE_LINE_MANAGER,
    comment: comment || 'Requester submitted this purchase requisition.',
  });
  const saved = await upsertPurchaseRequisition({
    ...pr,
    requesterCode: employeeCodeOf(requester),
    requesterName: requester.fullName,
    status: PR_STAGE_LINE_MANAGER,
    currentStage: PR_STAGE_LINE_MANAGER,
    currentWith: manager.employee.fullName,
    lineManagerName: manager.employee.fullName,
    lineManagerCode: employeeCodeOf(manager.employee),
    workflow,
    attachments: pr.attachments,
    lines: pr.lines,
  }, session.fullName || session.username);

  await notifyPerson({
    actor: session.fullName || session.username,
    employee: manager.employee,
    code: employeeCodeOf(manager.employee),
    name: manager.employee.fullName,
    title: `PR ${pr.prId} awaiting line manager approval`,
    body: `${requester.fullName} submitted purchase requisition ${pr.prId} (${pr.title}). Please review and approve.`,
    prId: pr.prId,
  });
  return saved;
};

const actorIsLineManager = (pr: Awaited<ReturnType<typeof loadPr>>, session: SessionPayload, employees: DleEmployeeDirectoryRow[]) => {
  if (codesMatch(session.employeeCode, pr.lineManagerCode)) return true;
  const me = findEmployee(employees, session.employeeCode || session.fullName);
  if (!me) return false;
  if (codesMatch(employeeCodeOf(me), pr.lineManagerCode)) return true;
  const requester = findEmployee(employees, pr.requesterCode || pr.requesterName);
  if (!requester) return false;
  const manager = resolveLineManagerForEmployee(requester, employees);
  return Boolean(manager && codesMatch(employeeCodeOf(manager.employee), employeeCodeOf(me)));
};

export const actionPurchaseRequisition = async (input: {
  prId: string;
  action: string;
  comment?: string;
  assignedBuyer?: string;
  assignedBuyerCode?: string;
}, session: SessionPayload, permissions: string[]) => {
  const action = compact(input.action).toLowerCase();
  const pr = await loadPr(input.prId);
  const employees = (await readEmployeeDirectoryFromDb()) || [];
  const actor = session.fullName || session.username;
  const actorCode = session.employeeCode || '';
  const isPm = sessionIsProcurementManager(session, permissions);
  const isLm = actorIsLineManager(pr, session, employees);
  const superActor = sessionIsSuper(session);
  const comment = compact(input.comment);
  const stage = compact(pr.currentStage || pr.status);

  if (action === 'assign-buyer') {
    if (!isPm && !superActor) throw new Error('Only the Procurement Manager can assign a buyer.');
    if (!/procurement manager/i.test(stage) && !/line manager review|submitted|under approval/i.test(stage)) {
      throw new Error('Assign a buyer after the line manager has approved and the PR is with Procurement.');
    }
    if (!/procurement manager/i.test(stage)) {
      throw new Error('The assigned buyer field is only available after line manager approval.');
    }
    const buyers = await listProcurementBuyers();
    const selected = buyers.find((buyer) => codesMatch(buyer.code, input.assignedBuyerCode) || compact(buyer.name) === compact(input.assignedBuyer));
    if (!selected) throw new Error('Select a buyer from the procurement team.');
    const workflow = appendEvent(pr.workflow, {
      at: nowIso(),
      action: 'Assigned Buyer',
      actor,
      actorCode,
      stage: PR_STAGE_PROCUREMENT_MANAGER,
      comment: comment || `Assigned to ${selected.name}.`,
    });
    return upsertPurchaseRequisition({
      ...pr,
      assignedBuyer: selected.name,
      assignedBuyerCode: selected.code,
      currentWith: selected.name,
      workflow,
      attachments: pr.attachments,
      lines: pr.lines,
    }, actor);
  }

  if (action === 'approve' || action === 'acknowledge') {
    if (/line manager/i.test(stage) || /^submitted$/i.test(stage)) {
      if (!isLm && !superActor) throw new Error('Only the requester\'s line manager can approve this PR.');
      const workflow = appendEvent(pr.workflow, {
        at: nowIso(),
        action: 'Line Manager Approved',
        actor,
        actorCode,
        stage: PR_STAGE_PROCUREMENT_MANAGER,
        comment: comment || 'Line manager approved.',
      });
      const saved = await upsertPurchaseRequisition({
        ...pr,
        status: PR_STAGE_PROCUREMENT_MANAGER,
        currentStage: PR_STAGE_PROCUREMENT_MANAGER,
        currentWith: 'Procurement Manager',
        workflow,
        attachments: pr.attachments,
        lines: pr.lines,
      }, actor);
      const managers = await listProcurementManagers();
      const requester = findEmployee(employees, pr.requesterCode || pr.requesterName);
      for (const manager of managers) {
        await notifyPerson({
          actor,
          employee: manager,
          code: employeeCodeOf(manager),
          name: manager.fullName,
          title: `PR ${pr.prId} awaiting procurement assignment`,
          body: `${actor} approved purchase requisition ${pr.prId} (${pr.title}). Assign a buyer, then acknowledge.`,
          prId: pr.prId,
        });
      }
      if (requester) {
        await notifyPerson({
          actor,
          employee: requester,
          code: employeeCodeOf(requester),
          name: requester.fullName,
          title: `PR ${pr.prId} approved by line manager`,
          body: `Your purchase requisition ${pr.prId} was approved by ${actor} and is now with the Procurement Manager.`,
          prId: pr.prId,
        });
      }
      return saved;
    }

    if (/procurement manager/i.test(stage)) {
      if (!isPm && !superActor) throw new Error('Only the Procurement Manager can acknowledge this PR.');
      const buyerName = compact(input.assignedBuyer) || compact(pr.assignedBuyer);
      const buyerCode = compact(input.assignedBuyerCode) || compact(pr.assignedBuyerCode);
      if (!buyerName || !buyerCode) {
        throw new Error('Assign a buyer in the procurement team before approving / acknowledging this PR.');
      }
      const buyers = await listProcurementBuyers();
      const selected = buyers.find((buyer) => codesMatch(buyer.code, buyerCode) || buyer.name === buyerName);
      if (!selected) throw new Error('Assigned buyer must be a member of the procurement team.');
      const workflow = appendEvent(pr.workflow, {
        at: nowIso(),
        action: 'Procurement Manager Acknowledged',
        actor,
        actorCode,
        stage: PR_STAGE_APPROVED,
        comment: comment || `Acknowledged and assigned to ${selected.name}.`,
      });
      const saved = await upsertPurchaseRequisition({
        ...pr,
        assignedBuyer: selected.name,
        assignedBuyerCode: selected.code,
        status: PR_STAGE_APPROVED,
        currentStage: PR_STAGE_APPROVED,
        currentWith: selected.name,
        workflow,
        attachments: pr.attachments,
        lines: pr.lines,
      }, actor);
      const requester = findEmployee(employees, pr.requesterCode || pr.requesterName);
      const buyer = findEmployee(employees, selected.code);
      if (requester) {
        await notifyPerson({
          actor,
          employee: requester,
          code: employeeCodeOf(requester),
          name: requester.fullName,
          title: `PR ${pr.prId} acknowledged by Procurement`,
          body: `Purchase requisition ${pr.prId} was acknowledged by ${actor}. Assigned buyer: ${selected.name}.`,
          prId: pr.prId,
        });
      }
      if (buyer) {
        await notifyPerson({
          actor,
          employee: buyer,
          code: selected.code,
          name: selected.name,
          title: `PR ${pr.prId} assigned to you`,
          body: `${actor} assigned purchase requisition ${pr.prId} (${pr.title}) to you for processing.`,
          prId: pr.prId,
        });
      }
      return saved;
    }
    throw new Error(`PR ${pr.prId} is not awaiting approval.`);
  }

  if (action === 'reject' || action === 'return') {
    const atLineManager = /line manager|^submitted$/i.test(stage);
    const atProcurement = /procurement manager/i.test(stage);
    const canAct = (atLineManager && (isLm || superActor)) || (atProcurement && (isPm || superActor));
    if (!canAct) throw new Error('You are not the current approver for this PR.');
    const nextStatus = action === 'reject' ? 'Rejected' : 'Returned';
    const workflow = appendEvent(pr.workflow, {
      at: nowIso(),
      action: nextStatus,
      actor,
      actorCode,
      stage: nextStatus,
      comment: comment || `${nextStatus} by ${actor}.`,
    });
    const saved = await upsertPurchaseRequisition({
      ...pr,
      status: nextStatus,
      currentStage: nextStatus,
      currentWith: pr.requesterName,
      workflow,
      attachments: pr.attachments,
      lines: pr.lines,
    }, actor);
    const requester = findEmployee(employees, pr.requesterCode || pr.requesterName);
    if (requester) {
      await notifyPerson({
        actor,
        employee: requester,
        code: employeeCodeOf(requester),
        name: requester.fullName,
        title: `PR ${pr.prId} ${nextStatus.toLowerCase()}`,
        body: `Purchase requisition ${pr.prId} was ${nextStatus.toLowerCase()} by ${actor}.${comment ? ` ${comment}` : ''}`,
        prId: pr.prId,
      });
    }
    return saved;
  }

  throw new Error('Unknown PR action.');
};
