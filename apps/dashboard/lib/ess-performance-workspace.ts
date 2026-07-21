import {
  buildPerformanceActorContext,
  loadTeamEmployeeIds,
  scopePerformanceDomain,
} from '@/lib/performance-access';
import { displayScore } from '@/lib/performance-calculation';
import type { PerformanceRole } from '@/lib/performance-management-types';
import type { EmployeeGoal } from '@/lib/performance-domain-types';
import { readPerformanceDomainState, resolveActivePerformanceCycle } from '@/lib/performance-domain-store';
import { readPayrollEmployees } from '@/lib/payroll-employee-source';
import type { SessionPayload } from '@/lib/auth/session';

export { ESS_PERFORMANCE_HREF } from '@/lib/performance-routes';

const compact = (value: unknown) => String(value || '').trim();

export type EssPerformanceGoalRow = {
  id: string;
  title: string;
  progress: number;
  dueDate: string;
  status: string;
  weight: number;
  acknowledgementRequired: boolean;
  employeeId?: string;
  employeeName?: string;
};

export type EssPerformanceReviewRow = {
  id: string;
  cycle: string;
  cycleName: string;
  form: string;
  type: string;
  status: string;
  score: number | null;
  employeeId?: string;
  employeeName?: string;
};

export type EssPerformanceTaskRow = {
  id: string;
  title: string;
  type: string;
  status: string;
  dueDate: string;
  employeeName: string;
  assigneeName: string;
};

export type EssPerformanceWorkspace = {
  scope: 'self' | 'team' | 'global';
  role: PerformanceRole;
  activeCycle: { id: string; name: string; status: string } | null;
  self: {
    goals: EssPerformanceGoalRow[];
    kpis: Array<{ label: string; value: number; target: number }>;
    reviews: EssPerformanceReviewRow[];
    developmentPlans: Array<{ id: string; title: string; owner: string; status: string }>;
    tasks: EssPerformanceTaskRow[];
    checkIns: Array<{ id: string; date: string; status: string; progressPercent: number; sharedNotes: string }>;
  };
  team: {
    isManager: boolean;
    directReports: Array<{ employeeId: string; employeeCode: string; fullName: string; department: string; jobTitle: string }>;
    goals: EssPerformanceGoalRow[];
    assessments: EssPerformanceReviewRow[];
    tasks: EssPerformanceTaskRow[];
    probation: Array<{ id: string; employeeName: string; status: string; endDate: string; recommendation?: string }>;
    pips: Array<{ id: string; employeeName: string; status: string; reason: string }>;
  };
  metrics: {
    goalsTotal: number;
    goalsAwaitingAck: number;
    pendingSelfAppraisal: number;
    pendingManagerReviews: number;
    openTasks: number;
    teamSize: number;
  };
};

const cycleName = (cycleId: string, cycles: Array<{ id: string; name: string }>) =>
  cycles.find((item) => item.id === cycleId)?.name || cycleId;

const mapGoals = (goals: EmployeeGoal[], includeEmployee = false): EssPerformanceGoalRow[] =>
  goals.map((goal) => ({
    id: goal.id,
    title: goal.title,
    progress: goal.progressPercent,
    dueDate: goal.dueDate,
    status: goal.status,
    weight: goal.weight,
    acknowledgementRequired: ['Assigned', 'Resubmitted', 'Discussion Requested'].includes(goal.status),
    ...(includeEmployee ? { employeeId: goal.employeeId, employeeName: goal.employeeName } : {}),
  }));

export const buildEssPerformanceWorkspace = async (
  session: SessionPayload,
): Promise<EssPerformanceWorkspace> => {
  const actor = buildPerformanceActorContext(session);
  const state = await readPerformanceDomainState();
  const payroll = await readPayrollEmployees().catch(() => ({ employees: [] as any[] }));
  const teamIds = await loadTeamEmployeeIds(actor, payroll.employees || []);
  const scoped = scopePerformanceDomain(state, actor, teamIds);
  const cycle = resolveActivePerformanceCycle(state);
  const cycleLabel = cycle ? { id: cycle.id, name: cycle.name, status: cycle.status } : null;

  const actorKeys = new Set([actor.employeeId, actor.employeeCode].map((key) => compact(key)).filter(Boolean));
  const selfGoals = scoped.goals.filter((goal) =>
    actorKeys.has(compact(goal.employeeId)) || actorKeys.has(compact(goal.employeeCode)),
  );
  const selfAssessments = scoped.assessments.filter((item) => actorKeys.has(compact(item.employeeId)));
  const selfResults = scoped.results.filter((item) => actorKeys.has(compact(item.employeeId)));
  const selfTasks = scoped.tasks.filter((task) =>
    task.assigneeId === actor.employeeId || task.assigneeId === actor.employeeCode || task.employeeId === actor.employeeId,
  );
  const selfCheckIns = scoped.checkIns.filter((item) => item.employeeId === actor.employeeId);

  const reviews: EssPerformanceReviewRow[] = [
    ...selfAssessments.map((item) => ({
      id: item.id,
      cycle: item.cycleId,
      cycleName: cycleName(item.cycleId, state.cycles),
      form: `${item.type} assessment`,
      type: item.type,
      status: item.status,
      score: null,
    })),
    ...selfResults
      .filter((item) => item.status === 'Published' || item.status === 'Amended')
      .map((item) => ({
        id: item.id,
        cycle: item.cycleId,
        cycleName: cycleName(item.cycleId, state.cycles),
        form: 'Published result',
        type: 'Result',
        status: item.acknowledgedAt ? 'Acknowledged' : item.status,
        score: displayScore(item.finalScore),
      })),
  ];

  const isManager = actor.scope === 'team' || actor.scope === 'global';
  const directReports = isManager
    ? (payroll.employees || []).filter((row) => {
        const managerKey = compact(row.managerEmployeeId || row.managerId).toLowerCase();
        const keys = new Set([actor.employeeId, actor.employeeCode].map((v) => compact(v).toLowerCase()).filter(Boolean));
        return managerKey && keys.has(managerKey);
      }).map((row) => ({
        employeeId: String(row.employeeId || row.employeeCode || ''),
        employeeCode: String(row.employeeCode || row.employeeId || ''),
        fullName: String(row.fullName || 'Employee'),
        department: String(row.department || 'Unassigned'),
        jobTitle: String(row.jobTitle || row.designation || 'Employee'),
      }))
    : [];

  const teamGoals = isManager
    ? scoped.goals.filter((goal) => teamIds.has(compact(goal.employeeId).toLowerCase()) || teamIds.has(compact(goal.employeeCode).toLowerCase()))
    : [];
  const teamAssessments = isManager
    ? scoped.assessments
      .filter((item) => item.type === 'Manager' && teamIds.has(compact(item.employeeId).toLowerCase()))
      .map((item) => ({
        id: item.id,
        cycle: item.cycleId,
        cycleName: cycleName(item.cycleId, state.cycles),
        form: 'Manager assessment',
        type: item.type,
        status: item.status,
        score: null,
        employeeId: item.employeeId,
        employeeName: item.employeeName,
      }))
    : [];
  const teamTasks = isManager
    ? scoped.tasks.filter((task) => {
        const assignee = compact(task.assigneeId).toLowerCase();
        const actorKeys = new Set([actor.employeeId, actor.employeeCode].map((v) => compact(v).toLowerCase()).filter(Boolean));
        return actorKeys.has(assignee);
      })
    : [];
  const teamProbation = isManager
    ? scoped.probation.filter((row) => teamIds.has(compact(row.employeeId).toLowerCase()) || teamIds.has(compact(row.employeeCode).toLowerCase()))
    : [];
  const teamPips = isManager
    ? scoped.pips.filter((row) => teamIds.has(compact(row.employeeId).toLowerCase()))
    : [];

  const goalsAck = selfGoals.filter((g) => ['Agreed', 'Active', 'Completed'].includes(g.status)).length;
  const pendingSelf = selfAssessments.filter((item) => item.type === 'Self' && ['Not Started', 'Draft', 'Returned'].includes(item.status)).length;
  const pendingMgr = teamAssessments.filter((item) => ['Draft', 'Pending Manager', 'Returned'].includes(item.status)).length;
  const openTasks = [...selfTasks, ...teamTasks].filter((task) => !['Completed', 'Cancelled'].includes(task.status)).length;

  return {
    scope: actor.scope,
    role: actor.performanceRole,
    activeCycle: cycleLabel,
    self: {
      goals: mapGoals(selfGoals),
      kpis: [
        {
          label: 'Goal acknowledgement',
          value: selfGoals.length ? Math.round((goalsAck / selfGoals.length) * 100) : 0,
          target: 100,
        },
        {
          label: 'Check-in progress',
          value: selfCheckIns.length
            ? Math.round(selfCheckIns.reduce((sum, row) => sum + Number(row.progressPercent || 0), 0) / selfCheckIns.length)
            : 0,
          target: 80,
        },
        {
          label: 'Open tasks',
          value: selfTasks.filter((task) => !['Completed', 'Cancelled'].includes(task.status)).length,
          target: 0,
        },
      ],
      reviews,
      developmentPlans: scoped.developmentPlans
        .filter((plan) => plan.employeeId === actor.employeeId)
        .map((plan) => ({
          id: plan.id,
          title: plan.need,
          owner: plan.actions[0]?.owner || 'Manager',
          status: plan.status,
        })),
      tasks: selfTasks.map((task) => ({
        id: task.id,
        title: task.title,
        type: task.type,
        status: task.status,
        dueDate: task.dueDate,
        employeeName: task.employeeName,
        assigneeName: task.assigneeName,
      })),
      checkIns: selfCheckIns.map((item) => ({
        id: item.id,
        date: item.date,
        status: item.status,
        progressPercent: item.progressPercent,
        sharedNotes: item.sharedNotes || '',
      })),
    },
    team: {
      isManager,
      directReports,
      goals: mapGoals(teamGoals, true),
      assessments: teamAssessments,
      tasks: teamTasks.map((task) => ({
        id: task.id,
        title: task.title,
        type: task.type,
        status: task.status,
        dueDate: task.dueDate,
        employeeName: task.employeeName,
        assigneeName: task.assigneeName,
      })),
      probation: teamProbation.map((row) => ({
        id: row.id,
        employeeName: row.employeeName,
        status: row.status,
        endDate: row.endDate,
        recommendation: row.recommendation,
      })),
      pips: teamPips.map((row) => ({
        id: row.id,
        employeeName: row.employeeName,
        status: row.status,
        reason: row.reason,
      })),
    },
    metrics: {
      goalsTotal: selfGoals.length,
      goalsAwaitingAck: selfGoals.filter((g) => ['Assigned', 'Resubmitted', 'Discussion Requested'].includes(g.status)).length,
      pendingSelfAppraisal: pendingSelf,
      pendingManagerReviews: pendingMgr,
      openTasks,
      teamSize: directReports.length,
    },
  };
};

/** Actions permitted from ESS (employees and line managers). HR admin actions stay in HRIS. */
export const ESS_PERFORMANCE_ACTIONS = new Set([
  'goal.acknowledge',
  'result.acknowledge',
  'goal.request-discussion',
  'goal.upsert',
  'assessment.save',
  'assessment.submit',
  'checkin.create',
  'midyear.change-request',
  'probation.recommend',
  'pip.upsert',
  'appeal.submit',
]);

export const assertEssPerformanceAction = (action: string) => {
  if (!ESS_PERFORMANCE_ACTIONS.has(action)) {
    return `Action "${action}" is not available in the employee portal. Contact HR for assistance.`;
  }
  return null;
};
