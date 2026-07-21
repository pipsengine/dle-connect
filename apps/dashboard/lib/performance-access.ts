import type { SessionPayload } from '@/lib/auth/session';
import { hasAnyPermission } from '@/lib/auth/permission-match';
import { isHrPortalUser } from '@/lib/access/route-access';
import { resolvePerformanceRole } from '@/lib/performance-management-menu-config';
import type { PerformanceRole } from '@/lib/performance-management-types';
import type { PerformanceDomainState, PerformanceDelegation, PerformanceTask } from '@/lib/performance-domain-types';
import { employeeReportsToManager } from '@/lib/reporting-manager-match';
import { normalizePayrollMatchKey } from '@/lib/sage-people-payroll-store';

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

export type PerformanceTeamEmployeeRow = {
  employeeId?: string;
  employeeCode?: string;
  fullName?: string;
  status?: string;
  managerEmployeeId?: string | number | null;
  managerId?: string | number | null;
  managerName?: string;
  functionalManager?: string;
  departmentHead?: string;
  jobTitle?: string;
  designation?: string;
  department?: string;
};

const inactiveEmployee = (status: unknown) => /terminated|resigned|retired|inactive|deceased|suspend/i.test(compact(status));

/** Same reporting match as ESS leave / MANAGER badge, plus ID fallback. */
export const employeeIsDirectReportOf = (
  employee: PerformanceTeamEmployeeRow,
  manager: Pick<PerformanceActorContext, 'employeeId' | 'employeeCode' | 'fullName'>,
) => {
  const managerKeys = new Set(
    [manager.employeeId, manager.employeeCode].map((value) => normalizePayrollMatchKey(value)).filter(Boolean),
  );
  const employeeKey = normalizePayrollMatchKey(employee.employeeCode || employee.employeeId);
  if (employeeKey && managerKeys.has(employeeKey)) return false;
  if (inactiveEmployee(employee.status)) return false;

  if (employeeReportsToManager(
    {
      managerName: employee.managerName,
      functionalManager: employee.functionalManager,
      departmentHead: employee.departmentHead,
    },
    {
      fullName: manager.fullName,
      employeeCode: manager.employeeCode,
      employeeId: manager.employeeId,
    },
  )) {
    return true;
  }

  const idManagerKey = normalizePayrollMatchKey(String(employee.managerEmployeeId || employee.managerId || ''));
  return Boolean(idManagerKey && managerKeys.has(idManagerKey));
};

export const listDirectReportsForActor = (
  actor: Pick<PerformanceActorContext, 'employeeId' | 'employeeCode' | 'fullName'>,
  employees: PerformanceTeamEmployeeRow[],
) => employees.filter((row) => employeeIsDirectReportOf(row, actor));

const isDelegationActiveForActor = (
  row: PerformanceDelegation,
  actor: Pick<PerformanceActorContext, 'employeeId' | 'employeeCode'>,
  as: 'delegate' | 'owner',
) => {
  const today = new Date().toISOString().slice(0, 10);
  if (row.status === 'Cancelled' || row.status === 'Expired') return false;
  if (row.startDate > today || row.endDate < today) return false;
  const actorKeys = new Set([norm(actor.employeeId), norm(actor.employeeCode)].filter(Boolean));
  if (as === 'delegate') return actorKeys.has(norm(row.toManagerId));
  return actorKeys.has(norm(row.fromManagerId));
};

export const activePerformanceDelegationsForActor = (
  actor: Pick<PerformanceActorContext, 'employeeId' | 'employeeCode'>,
  delegations: PerformanceDelegation[] = [],
) => ({
  received: delegations.filter((row) => isDelegationActiveForActor(row, actor, 'delegate')),
  owned: delegations.filter((row) => isDelegationActiveForActor(row, actor, 'owner')),
});

export const loadTeamEmployeeIds = async (
  actor: PerformanceActorContext,
  employees: PerformanceTeamEmployeeRow[],
  delegations: PerformanceDelegation[] = [],
): Promise<Set<string>> => {
  const team = new Set<string>();
  // Global HR scope sees full population; team ids unused for filtering.
  if (actor.scope === 'global') return team;

  const addRow = (row: PerformanceTeamEmployeeRow) => {
    const employeeId = compact(row.employeeId);
    const employeeCode = compact(row.employeeCode);
    if (employeeId) team.add(norm(employeeId));
    if (employeeCode) team.add(norm(employeeCode));
  };

  for (const row of listDirectReportsForActor(actor, employees)) addRow(row);

  const { received } = activePerformanceDelegationsForActor(actor, delegations);
  for (const delegation of received) {
    const owner = {
      employeeId: delegation.fromManagerId,
      employeeCode: delegation.fromManagerId,
      fullName: delegation.fromManagerName,
    };
    for (const row of listDirectReportsForActor(owner, employees)) addRow(row);
  }

  return team;
};

/** Promote self → team when ESS reporting match finds direct reports. */
export const withEffectivePerformanceScope = (
  actor: PerformanceActorContext,
  teamIds: Set<string>,
): PerformanceActorContext => {
  if (actor.scope === 'global') return actor;
  if (teamIds.size > 0 && actor.scope === 'self') {
    return { ...actor, scope: 'team' };
  }
  return actor;
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
    delegations: (state.delegations || []).filter((row) => {
      const keys = actorKeys(actor);
      return keys.has(norm(row.fromManagerId)) || keys.has(norm(row.toManagerId));
    }),
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

  if (action === 'checkin.update') {
    const checkIn = state.checkIns.find((item) => item.id === compact(data.id));
    if (!checkIn) return 'Check-in not found.';
    if (!employeeInPerformanceScope(checkIn.employeeId, undefined, actor, teamIds)) {
      return 'You are not authorized to update this check-in.';
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
    if ((type === 'Self' || type === 'Mid-Year') && assessment && !employeeInPerformanceScope(assessment.employeeId, undefined, { ...actor, scope: 'self' }, new Set())) {
      return 'You can only submit your own self-assessment.';
    }
    if (type === 'Manager' && actor.scope === 'self' && teamIds.size === 0) {
      return 'Manager assessments require supervisor or HR access.';
    }
  }

  if (action === 'assessment.return') {
    const assessment = state.assessments.find((item) => item.id === compact(data.id));
    if (!assessment) return 'Assessment not found.';
    if (assessment.type === 'Self' || assessment.type === 'Mid-Year') {
      if (!employeeInPerformanceScope(assessment.employeeId, undefined, actor, teamIds) || actor.scope === 'self') {
        return 'Only the line manager (or delegate) can return a self-assessment.';
      }
    } else if (assessment.type === 'Manager' && actor.scope !== 'global') {
      return 'Returning manager assessments requires HR performance administration.';
    }
  }

  if (action === 'assessment.reopen') {
    const assessment = state.assessments.find((item) => item.id === compact(data.id));
    if (!assessment) return 'Assessment not found.';
    if ((assessment.type === 'Self' || assessment.type === 'Mid-Year')
      && !employeeInPerformanceScope(assessment.employeeId, undefined, { ...actor, scope: 'self' }, new Set())) {
      return 'You can only reopen your own returned assessment.';
    }
    if (assessment.type === 'Manager' && !employeeInPerformanceScope(assessment.employeeId, undefined, actor, teamIds)) {
      return 'You are not authorized to reopen this manager assessment.';
    }
  }

  if (action === 'delegation.upsert' || action === 'delegation.cancel') {
    if (actor.scope === 'self' && teamIds.size === 0) {
      return 'Performance delegation requires line-manager access.';
    }
  }

  return null;
};

export const performanceRoleLabel = (role: PerformanceRole) => resolvePerformanceRole(role);
