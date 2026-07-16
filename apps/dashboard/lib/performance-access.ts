import type { SessionPayload } from '@/lib/auth/session';
import { hasAnyPermission } from '@/lib/auth/permission-match';
import { isHrPortalUser } from '@/lib/access/route-access';
import { resolvePerformanceRole } from '@/lib/performance-management-menu-config';
import type { PerformanceRole } from '@/lib/performance-management-types';
import type { PerformanceDomainState, PerformanceTask } from '@/lib/performance-domain-types';

export type PerformanceScope = 'global' | 'team' | 'self';

export type PerformanceActorContext = {
  employeeId: string;
  employeeCode: string;
  fullName: string;
  roles: string[];
  permissions: string[];
  isGlobalAdmin: boolean;
  performanceRole: PerformanceRole;
  scope: PerformanceScope;
};

const compact = (value: unknown) => String(value || '').trim();
const norm = (value: unknown) => compact(value).toLowerCase();

const HR_PERFORMANCE_PERMISSIONS = [
  'performance.admin',
  'performance.cycles',
  'performance.objectives',
  'performance.calibration',
  'performance.appeals',
  'performance.probation',
  'hris.performance-management',
  'page.hris.performance-management.view',
  'page.hris.management.view',
  'hris.view',
];

const MANAGER_PERFORMANCE_PERMISSIONS = [
  'performance.reviews',
  'performance.goals',
  'performance.probation',
];

const roleText = (roles: string[]) => roles.join(' ');

export const resolvePerformanceRoleFromSession = (session: Pick<SessionPayload, 'roles' | 'permissions' | 'isGlobalAdmin'>): PerformanceRole => {
  const roles = session.roles || [];
  const permissions = session.permissions || [];
  if (session.isGlobalAdmin || roles.includes('Super Administrator')) return 'Super Administrator';
  if (roles.some((role) => /HR Manager|HR Director/i.test(role)) || hasAnyPermission(permissions, ['performance.admin'])) return 'HR Manager';
  if (roles.some((role) => /HR Officer|HR Administrator|Human Resource/i.test(role)) || isHrPortalUser(session)) return 'HR Officer';
  if (roles.some((role) => /Executive Management|Managing Director|Chief Executive/i.test(role))) return 'Executive Management';
  if (roles.some((role) => /Project Manager/i.test(role))) return 'Project Manager';
  if (roles.some((role) => /Supervisor|Line Manager/i.test(role))) return 'Supervisor';
  return 'Employee';
};

export const resolvePerformanceScope = (session: Pick<SessionPayload, 'roles' | 'permissions' | 'isGlobalAdmin' | 'department' | 'unit'>): PerformanceScope => {
  const permissions = session.permissions || [];
  if (
    session.isGlobalAdmin
    || hasAnyPermission(permissions, HR_PERFORMANCE_PERMISSIONS)
    || isHrPortalUser(session)
  ) {
    return 'global';
  }
  if (
    hasAnyPermission(permissions, MANAGER_PERFORMANCE_PERMISSIONS)
    || roleText(session.roles || []).match(/Supervisor|Line Manager|Project Manager|Manager/i)
  ) {
    return 'team';
  }
  return 'self';
};

export const buildPerformanceActorContext = (session: SessionPayload): PerformanceActorContext => {
  const performanceRole = resolvePerformanceRoleFromSession(session);
  return {
    employeeId: String(session.employeeId || session.employeeCode || session.sub || ''),
    employeeCode: String(session.employeeCode || session.employeeId || session.sub || ''),
    fullName: session.fullName || session.username,
    roles: session.roles || [],
    permissions: session.permissions || [],
    isGlobalAdmin: Boolean(session.isGlobalAdmin),
    performanceRole,
    scope: resolvePerformanceScope(session),
  };
};

export const loadTeamEmployeeIds = async (
  actor: PerformanceActorContext,
  employees: Array<{ employeeId?: string; employeeCode?: string; managerEmployeeId?: string; managerId?: string }>,
): Promise<Set<string>> => {
  const keys = new Set([norm(actor.employeeId), norm(actor.employeeCode)].filter(Boolean));
  const team = new Set<string>();
  if (actor.scope !== 'team') return team;
  for (const row of employees) {
    const managerKey = norm(row.managerEmployeeId || row.managerId);
    if (!managerKey || !keys.has(managerKey)) continue;
    const employeeId = compact(row.employeeId);
    const employeeCode = compact(row.employeeCode);
    if (employeeId) team.add(norm(employeeId));
    if (employeeCode) team.add(norm(employeeCode));
  }
  return team;
};

const actorKeys = (actor: PerformanceActorContext) =>
  new Set([norm(actor.employeeId), norm(actor.employeeCode)].filter(Boolean));

export const employeeInPerformanceScope = (
  employeeId: string,
  employeeCode: string | undefined,
  actor: PerformanceActorContext,
  teamIds: Set<string>,
) => {
  if (actor.scope === 'global') return true;
  const id = norm(employeeId);
  const code = norm(employeeCode);
  const self = actorKeys(actor);
  if (actor.scope === 'self') return self.has(id) || (code ? self.has(code) : false);
  return self.has(id) || (code ? self.has(code) : false) || teamIds.has(id) || (code ? teamIds.has(code) : false);
};

const filterByEmployee = <T extends { employeeId: string; employeeCode?: string }>(
  rows: T[],
  actor: PerformanceActorContext,
  teamIds: Set<string>,
) => rows.filter((row) => employeeInPerformanceScope(row.employeeId, row.employeeCode, actor, teamIds));

const filterTasks = (rows: PerformanceTask[], actor: PerformanceActorContext, teamIds: Set<string>) =>
  rows.filter((row) =>
    employeeInPerformanceScope(row.employeeId, undefined, actor, teamIds)
    || employeeInPerformanceScope(row.assigneeId, undefined, actor, teamIds),
  );

export const scopePerformanceDomain = (
  state: PerformanceDomainState,
  actor: PerformanceActorContext,
  teamIds: Set<string>,
): PerformanceDomainState => {
  if (actor.scope === 'global') return state;
  return {
    ...state,
    eligibility: filterByEmployee(state.eligibility, actor, teamIds),
    goals: filterByEmployee(state.goals, actor, teamIds),
    checkIns: filterByEmployee(state.checkIns, actor, teamIds),
    assessments: filterByEmployee(state.assessments, actor, teamIds),
    raters: filterByEmployee(state.raters, actor, teamIds),
    calibration: filterByEmployee(state.calibration, actor, teamIds),
    results: filterByEmployee(state.results, actor, teamIds),
    appeals: filterByEmployee(state.appeals, actor, teamIds),
    pips: filterByEmployee(state.pips, actor, teamIds),
    developmentPlans: filterByEmployee(state.developmentPlans, actor, teamIds),
    recognitions: filterByEmployee(state.recognitions, actor, teamIds),
    probation: filterByEmployee(state.probation, actor, teamIds),
    tasks: filterTasks(state.tasks, actor, teamIds),
  };
};

const requiresGlobal = new Set([
  'cycle.create',
  'cycle.submit-approval',
  'cycle.approve-publish',
  'cycle.advance-status',
  'cycle.clone',
  'company-objective.upsert',
  'company-objective.publish',
  'company-objective.score',
  'calibration.decide',
  'result.publish',
  'appeal.decide',
  'pip.activate',
  'probation.decide',
  'config.update',
  'report.schedule',
  'report.run',
  'analytics.refresh',
]);

const selfOnly = new Set([
  'goal.acknowledge',
  'result.acknowledge',
]);

const findGoal = (state: PerformanceDomainState, goalId: string) => state.goals.find((item) => item.id === goalId);
const findResult = (state: PerformanceDomainState, resultId: string) => state.results.find((item) => item.id === resultId);

export const assertPerformanceActionAllowed = (
  action: string,
  actor: PerformanceActorContext,
  data: Record<string, unknown>,
  state: PerformanceDomainState,
  teamIds: Set<string>,
): string | null => {
  if (requiresGlobal.has(action)) {
    if (actor.scope !== 'global') return 'This action requires HR performance administration access.';
    if (action.startsWith('cycle.') && !['HR Manager', 'HR Officer', 'Super Administrator'].includes(actor.performanceRole) && !hasAnyPermission(actor.permissions, ['performance.admin', 'performance.cycles'])) {
      return 'You are not authorized to manage performance cycles.';
    }
    if (action === 'config.update' && !hasAnyPermission(actor.permissions, ['performance.admin']) && actor.performanceRole !== 'Super Administrator') {
      return 'You are not authorized to change performance configuration.';
    }
    return null;
  }

  if (selfOnly.has(action)) {
    const goal = action === 'goal.acknowledge' ? findGoal(state, compact(data.id)) : null;
    const result = action === 'result.acknowledge' ? findResult(state, compact(data.id)) : null;
    const employeeId = goal?.employeeId || result?.employeeId || '';
    const employeeCode = goal?.employeeCode;
    if (!employeeInPerformanceScope(employeeId, employeeCode, { ...actor, scope: 'self' }, new Set())) {
      return 'You can only acknowledge your own performance records.';
    }
    return null;
  }

  if (action === 'appeal.submit') {
    const result = findResult(state, compact(data.resultId));
    if (!result || !employeeInPerformanceScope(result.employeeId, undefined, { ...actor, scope: 'self' }, new Set())) {
      return 'You can only appeal your own published results.';
    }
    return null;
  }

  if (action === 'goal.request-discussion' || action === 'midyear.change-request') {
    const goal = findGoal(state, compact(data.id) || compact(data.goalId));
    if (!goal || !employeeInPerformanceScope(goal.employeeId, goal.employeeCode, { ...actor, scope: 'self' }, new Set())) {
      return 'You can only request changes on your own goals.';
    }
    return null;
  }

  const targetEmployeeId = compact(data.employeeId)
    || findGoal(state, compact(data.id))?.employeeId
    || findResult(state, compact(data.id))?.employeeId
    || state.assessments.find((item) => item.id === compact(data.id))?.employeeId
    || state.probation.find((item) => item.id === compact(data.id))?.employeeId
    || '';

  const targetEmployeeCode = compact(data.employeeCode)
    || findGoal(state, compact(data.id))?.employeeCode
    || state.probation.find((item) => item.id === compact(data.id))?.employeeCode;

  if (targetEmployeeId || targetEmployeeCode) {
    if (!employeeInPerformanceScope(targetEmployeeId, targetEmployeeCode, actor, teamIds)) {
      return 'You are not authorized to act on this employee record.';
    }
  }

  if (action === 'assessment.submit' || action === 'assessment.save') {
    const assessment = state.assessments.find((item) => item.id === compact(data.id));
    const type = compact(data.type) || assessment?.type;
    if (type === 'Self' && assessment && !employeeInPerformanceScope(assessment.employeeId, undefined, { ...actor, scope: 'self' }, new Set())) {
      return 'You can only submit your own self-assessment.';
    }
    if (type === 'Manager' && actor.scope === 'self') {
      return 'Manager assessments require supervisor or HR access.';
    }
  }

  return null;
};

export const performanceRoleLabel = (role: PerformanceRole) => resolvePerformanceRole(role);
