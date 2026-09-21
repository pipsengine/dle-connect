import { extractSupervisorEmployeeCode, supervisorCodesMatch } from '@/lib/timesheet-agege-blasting';

export type OvertimeAuthorizationActor = {
  fullName?: string | null;
  username?: string | null;
  employeeCode?: string | null;
  employeeId?: string | null;
  email?: string | null;
  roles?: string[] | null;
  isGlobalAdmin?: boolean;
  canOverride?: boolean;
};

export type OvertimeAuthorizationScopeRequest = {
  status: string;
  supervisorCode?: string | null;
  supervisorName?: string | null;
  createdBy?: string | null;
  currentOwnerName?: string | null;
  currentOwnerRole?: string | null;
  projectManagerName?: string | null;
  projectManagerEmail?: string | null;
  gmOperationsName?: string | null;
  gmOperationsEmail?: string | null;
  hrApproverName?: string | null;
  hrApproverEmail?: string | null;
};

const compact = (value: unknown) => String(value || '').trim();
const lower = (value: unknown) => compact(value).toLowerCase();

const CLOSED_STATUSES = new Set(['HR Approved', 'MD Approved', 'Rejected', 'Cancelled']);

const GENERIC_OWNER_KEYS = new Set([
  'projectmanager',
  'gmoperations',
  'generalmanager',
  'hrmanager',
  'hrapprover',
  'unassigned',
  'closed',
]);

const personTokens = (value: unknown) =>
  lower(value)
    .replace(/\b(mr|mrs|miss|ms|dr|eng|engr)\b\.?/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 1);

const ownerKey = (value: unknown) => personTokens(value).join('');

const namesOverlap = (left: unknown, right: unknown) => {
  const a = personTokens(left);
  const b = personTokens(right);
  if (!a.length || !b.length) return false;
  if (a.join('') === b.join('')) return true;
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length <= b.length ? b : a;
  return shorter.every((token) => longer.includes(token));
};

const actorValues = (actor: OvertimeAuthorizationActor) =>
  [actor.employeeCode, actor.employeeId, actor.username, actor.fullName].map(compact).filter(Boolean);

const actorRoleText = (actor: OvertimeAuthorizationActor) => lower((actor.roles || []).join(' '));

const actorIsSuperAdmin = (actor: OvertimeAuthorizationActor) => {
  const text = actorRoleText(actor);
  return Boolean(actor.isGlobalAdmin || actor.canOverride || /\bsuper\s*admin/.test(text) || text === 'administrator' || /\bapplication administrator\b/.test(text));
};

export const actorCanBypassOvertimeWorkflow = (actor?: OvertimeAuthorizationActor | null) =>
  Boolean(actor && actorIsSuperAdmin(actor));

export const actorSeesAllOvertimeAuthorizations = (actor?: OvertimeAuthorizationActor | null) => {
  if (!actor) return false;
  if (actorIsSuperAdmin(actor)) return true;
  const text = actorRoleText(actor);
  return (
    /\bhr administrator\b/.test(text)
    || /\bhr manager\b/.test(text)
    || /\bhr director\b/.test(text)
    || /\bhr officer\b/.test(text)
    || /\bhuman resources\b/.test(text)
  );
};

const isGenericOwnerName = (value: unknown) => {
  const key = ownerKey(value);
  return !key || GENERIC_OWNER_KEYS.has(key);
};

const actorMatchesPerson = (actor: OvertimeAuthorizationActor, name?: string | null, email?: string | null) => {
  const targetEmail = lower(email);
  const actorEmail = lower(actor.email);
  if (targetEmail && actorEmail && targetEmail === actorEmail) return true;
  const nameCode = extractSupervisorEmployeeCode(name);
  const values = actorValues(actor);
  if (!values.length) return false;
  if (nameCode && values.some((value) => supervisorCodesMatch(value, nameCode) || supervisorCodesMatch(value, name))) {
    return true;
  }
  return values.some((value) => namesOverlap(value, name) || supervisorCodesMatch(value, name));
};

export const actorIsOvertimeBookingSupervisor = (
  request: OvertimeAuthorizationScopeRequest,
  actor?: OvertimeAuthorizationActor | null,
) => {
  if (!actor) return false;
  const supervisorValues = [request.supervisorCode, request.supervisorName, request.createdBy].map(compact).filter(Boolean);
  if (!supervisorValues.length) return false;
  return actorValues(actor).some((actorValue) =>
    supervisorValues.some((supervisorValue) =>
      supervisorCodesMatch(actorValue, supervisorValue) || namesOverlap(actorValue, supervisorValue),
    ),
  );
};

type StageOwner = {
  name: string;
  email: string | null;
  roleKey: 'pm' | 'gm' | 'hr' | null;
};

export const currentOvertimeApprovalOwner = (request: OvertimeAuthorizationScopeRequest): StageOwner => {
  if (CLOSED_STATUSES.has(request.status)) return { name: '', email: null, roleKey: null };
  if (request.status === 'Submitted') {
    return {
      name: compact(request.projectManagerName || request.currentOwnerName),
      email: compact(request.projectManagerEmail) || null,
      roleKey: 'pm',
    };
  }
  if (request.status === 'Project Manager Approved') {
    return {
      name: compact(request.gmOperationsName || request.currentOwnerName),
      email: compact(request.gmOperationsEmail) || null,
      roleKey: 'gm',
    };
  }
  if (request.status === 'GM Operations Approved') {
    return {
      name: compact(request.hrApproverName || request.currentOwnerName),
      email: compact(request.hrApproverEmail) || null,
      roleKey: 'hr',
    };
  }
  return { name: compact(request.currentOwnerName), email: null, roleKey: null };
};

const actorMatchesApprovalRole = (actor: OvertimeAuthorizationActor, roleKey: StageOwner['roleKey']) => {
  const text = lower((actor.roles || []).join(' '));
  if (roleKey === 'pm') return /\bproject manager\b/.test(text);
  if (roleKey === 'gm') return /\bgm operations\b|\bgeneral manager\b/.test(text);
  if (roleKey === 'hr') return /\bhr manager\b|\bhr officer\b|\bhr director\b|\bhr administrator\b|\bhuman resources\b|\bpayroll\b/.test(text);
  return false;
};

export const actorIsCurrentOvertimeApprover = (
  request: OvertimeAuthorizationScopeRequest,
  actor?: OvertimeAuthorizationActor | null,
) => {
  if (!actor || CLOSED_STATUSES.has(request.status)) return false;
  const owner = currentOvertimeApprovalOwner(request);
  if (!owner.roleKey) return false;
  if (actorMatchesPerson(actor, owner.name, owner.email)) return true;
  if (isGenericOwnerName(owner.name) && actorMatchesApprovalRole(actor, owner.roleKey)) return true;
  return false;
};

export const actorCanSeeOvertimeAuthorization = (
  request: OvertimeAuthorizationScopeRequest,
  actor?: OvertimeAuthorizationActor | null,
) => {
  if (actorSeesAllOvertimeAuthorizations(actor)) return true;
  return actorIsOvertimeBookingSupervisor(request, actor) || actorIsCurrentOvertimeApprover(request, actor);
};

export const actorCanActOnOvertimeAuthorization = (
  request: OvertimeAuthorizationScopeRequest,
  actor?: OvertimeAuthorizationActor | null,
) => {
  if (!actor || CLOSED_STATUSES.has(request.status)) return false;
  if (actorIsSuperAdmin(actor)) return true;
  return actorIsCurrentOvertimeApprover(request, actor);
};

export const scopeOvertimeAuthorizationRequests = <T extends OvertimeAuthorizationScopeRequest>(
  requests: T[],
  actor?: OvertimeAuthorizationActor | null,
) =>
  requests
    .filter((request) => actorCanSeeOvertimeAuthorization(request, actor))
    .map((request) => ({
      ...request,
      canAct: actorCanActOnOvertimeAuthorization(request, actor),
    }));
