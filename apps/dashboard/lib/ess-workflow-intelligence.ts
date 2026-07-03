import { workflowDeadlineDays } from '@/lib/leave-workflow-service';

export const ENTERPRISE_WORKFLOW_STAGES = [
  { id: 'employee', label: 'Employee', shortLabel: 'Employee' },
  { id: 'supervisor', label: 'Supervisor', shortLabel: 'Supervisor' },
  { id: 'line-manager', label: 'Line Manager', shortLabel: 'Line Mgr' },
  { id: 'dept-manager', label: 'Department Manager', shortLabel: 'Dept Mgr' },
  { id: 'hr', label: 'HR', shortLabel: 'HR' },
  { id: 'payroll', label: 'Payroll', shortLabel: 'Payroll' },
  { id: 'completed', label: 'Completed', shortLabel: 'Done' },
] as const;

export type WorkflowStageState = 'completed' | 'current' | 'pending' | 'rejected' | 'escalated';

export type WorkflowStageNode = {
  id: string;
  label: string;
  owner: string;
  state: WorkflowStageState;
  actedAt?: string | null;
  comment?: string | null;
  slaHours?: number;
  elapsedHours?: number;
};

export type WorkflowRegisterRow = {
  id: string;
  employee: string;
  employeeId: string;
  request: string;
  requestType: string;
  department: string;
  currentStage: string;
  approver: string;
  priority: string;
  submittedAt: string;
  elapsedHours: number;
  slaHours: number;
  slaStatus: 'On Track' | 'At Risk' | 'Overdue' | 'Completed';
  status: string;
  stages: WorkflowStageNode[];
  comments: Array<{ at: string; actor: string; comment: string }>;
  businessProcess?: string;
  workflowVersion?: string;
};

export type WorkflowIntelligence = {
  kpis: {
    pendingRequests: number;
    awaitingMyAction: number;
    approvedToday: number;
    slaCompliancePct: number;
    escalations: number;
    completedThisMonth: number;
  };
  kpiTrends: {
    pendingRequests: number;
    awaitingMyAction: number;
    approvedToday: number;
    slaCompliancePct: number;
    escalations: number;
    completedThisMonth: number;
  };
  selectedRequest: WorkflowRegisterRow | null;
  register: WorkflowRegisterRow[];
  pendingActions: Array<{ id: string; title: string; status: string; owner: string; dueLabel: string; severity: 'high' | 'medium' | 'low' }>;
  notifications: Array<{ id: string; title: string; channel: string; status: string; createdAt: string }>;
  auditTimeline: Array<{ id: string; action: string; actor: string; at: string; comment?: string; tone: 'blue' | 'green' | 'amber' | 'red' | 'slate' }>;
  slaMonitor: { compliancePct: number; averageApprovalHours: number; overdueCount: number; targetHours: number };
  aiInsights: {
    delayPrediction: string;
    likelyCompletion: string;
    recommendedEscalation: string;
    workloadBalance: string;
    suggestedDelegate: string;
    bottleneck: string;
    confidenceScore: number;
  };
  analytics: {
    approvalTimeTrend: number[];
    distribution: Array<{ label: string; value: number; color: string }>;
    bottlenecks: Array<{ label: string; value: number }>;
    monthlyVolume: number[];
  };
};

type EssRequestLike = {
  id: string;
  employeeId: string;
  category: string;
  title: string;
  status: string;
  priority: string;
  submittedAt: string;
  updatedAt: string;
  approvers: string[];
  comments: Array<{ at: string; actor: string; comment: string }>;
  workflow?: Array<{ stage: string; owner: string; status: string; actedAt?: string | null; comment?: string | null }>;
  leaveType?: string;
  startDate?: string;
  endDate?: string;
  days?: number;
  lineManagerName?: string;
};

const hoursBetween = (from: string, to = new Date().toISOString()) => {
  const start = new Date(from).getTime();
  const end = new Date(to).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return 0;
  return Math.max(0, Math.round((end - start) / 3_600_000));
};

const isTerminal = (status: string) => /approved|rejected|closed|terminated|cancelled|completed/i.test(status);
const isRejected = (status: string) => /rejected|terminated/i.test(status);

const currentStageIndexForStatus = (status: string) => {
  const text = status.toLowerCase();
  if (/approved|closed|completed|published/.test(text)) return 6;
  if (/payroll/.test(text)) return 5;
  if (/hr review|finance review/.test(text)) return 4;
  if (/department|dept/.test(text)) return 3;
  if (/line manager|supervisor review/.test(text)) return 2;
  if (/submitted|draft|supervisor/.test(text)) return 1;
  return 1;
};

const slaHoursForCategory = (
  category: string,
  catalog: Array<{ id?: string; label: string; area?: string; slaHours: number }>,
) => {
  const normalized = category.toLowerCase();
  return catalog.find((item) =>
    item.label.toLowerCase() === normalized
    || item.id?.toLowerCase() === normalized
    || item.area?.toLowerCase() === normalized,
  )?.slaHours || 48;
};

export const serviceWorkflowFor = (
  workflow: string[],
  employeeName: string,
  managerName: string,
  status: string,
  now: string,
) => {
  const rejected = isRejected(status);
  const terminal = isTerminal(status);
  const currentIndex = (() => {
    const text = status.toLowerCase();
    if (terminal && !rejected) return workflow.length;
    if (/finance/.test(text)) {
      const index = workflow.findIndex((stage) => /finance/i.test(stage));
      return index >= 0 ? index : workflow.length - 1;
    }
    if (/hr/.test(text)) {
      const index = workflow.findIndex((stage) => /hr/i.test(stage));
      return index >= 0 ? index : Math.min(2, workflow.length - 1);
    }
    if (/line manager|supervisor/.test(text)) {
      const index = workflow.findIndex((stage) => /line manager|supervisor/i.test(stage));
      return index >= 0 ? index : 1;
    }
    if (/submitted/.test(text)) return Math.min(1, workflow.length - 1);
    return Math.min(1, workflow.length - 1);
  })();

  return workflow.map((stage, index) => {
    let stepStatus = 'Pending';
    if (index === 0) stepStatus = 'Completed';
    else if (rejected && index === currentIndex) stepStatus = 'Rejected';
    else if (terminal && !rejected) stepStatus = 'Completed';
    else if (index === currentIndex) stepStatus = 'Current';
    else if (index < currentIndex) stepStatus = 'Completed';

    return {
      stage,
      owner: index === 0 ? employeeName : index === 1 ? managerName : stage,
      status: stepStatus,
      actedAt: index === 0 ? now : index < currentIndex ? now : null,
      comment: index === 0 ? 'Submitted from Employee Self-Service.' : null,
    };
  });
};

const buildStagesFromRequestWorkflow = (request: EssRequestLike, slaHours: number): WorkflowStageNode[] => {
  const workflow = request.workflow || [];
  const elapsed = hoursBetween(request.submittedAt);
  const overdue = elapsed > slaHours;

  return workflow.map((step, index) => {
    const text = (step.status || '').toLowerCase();
    let state: WorkflowStageState = 'pending';
    if (/reject/.test(text)) state = 'rejected';
    else if (/complete|delivered/.test(text)) state = 'completed';
    else if (/current/.test(text)) state = overdue ? 'escalated' : 'current';
    return {
      id: `wf-${index}`,
      label: step.stage,
      owner: step.owner,
      state,
      actedAt: step.actedAt || null,
      comment: step.comment || null,
      slaHours: Math.max(1, Math.round(slaHours / Math.max(workflow.length, 1))),
      elapsedHours: state === 'current' || state === 'escalated' ? elapsed : undefined,
    };
  });
};

const buildStages = (
  request: EssRequestLike,
  employeeName: string,
  department: string,
  managerName: string,
  slaHours: number,
): WorkflowStageNode[] => {
  if (request.workflow?.length) return buildStagesFromRequestWorkflow(request, slaHours);

  const currentIndex = currentStageIndexForStatus(request.status);
  const rejected = isRejected(request.status);
  const owners = [
    employeeName,
    managerName || 'Supervisor',
    request.lineManagerName || managerName || 'Line Manager',
    'Department Manager',
    'HR Manager',
    'Payroll Officer',
    'System',
  ];
  const workflowMap = new Map((request.workflow || []).map((step) => [step.stage.toLowerCase(), step]));

  return ENTERPRISE_WORKFLOW_STAGES.map((stage, index) => {
    const matched = [...workflowMap.values()].find((step) => step.stage.toLowerCase().includes(stage.label.toLowerCase().split(' ')[0]!));
    let state: WorkflowStageState = 'pending';
    if (rejected && index === currentIndex) state = 'rejected';
    else if (index < currentIndex) state = 'completed';
    else if (index === currentIndex && !isTerminal(request.status)) state = 'current';
    else if (index === 6 && isTerminal(request.status) && !rejected) state = 'completed';
    const elapsed = hoursBetween(request.submittedAt);
    if (state === 'current' && elapsed > slaHours) state = 'escalated';
    return {
      id: stage.id,
      label: stage.label,
      owner: matched?.owner || owners[index] || stage.label,
      state,
      actedAt: matched?.actedAt || (state === 'completed' ? request.updatedAt : null),
      comment: matched?.comment || null,
      slaHours: Math.round(slaHours / 6),
      elapsedHours: state === 'current' ? elapsed : undefined,
    };
  });
};

const rowFromRequest = (
  request: EssRequestLike,
  employeeName: string,
  department: string,
  managerName: string,
  catalog: Array<{ id?: string; label: string; area?: string; slaHours: number }>,
): WorkflowRegisterRow => {
  const slaHours = slaHoursForCategory(request.category, catalog);
  const elapsedHours = hoursBetween(request.submittedAt);
  const stages = buildStages(request, employeeName, department, managerName, slaHours);
  const currentStage = stages.find((item) => item.state === 'current' || item.state === 'escalated' || item.state === 'rejected')
    || stages.filter((item) => item.state === 'completed').at(-1)
    || stages[0]!;
  let slaStatus: WorkflowRegisterRow['slaStatus'] = 'On Track';
  if (isTerminal(request.status) && !isRejected(request.status)) slaStatus = 'Completed';
  else if (elapsedHours > slaHours) slaStatus = 'Overdue';
  else if (elapsedHours > slaHours * 0.75) slaStatus = 'At Risk';

  return {
    id: request.id,
    employee: employeeName,
    employeeId: request.employeeId,
    request: request.title,
    requestType: request.category,
    department,
    currentStage: currentStage.label,
    approver: currentStage.owner,
    priority: request.priority || 'Normal',
    submittedAt: request.submittedAt,
    elapsedHours,
    slaHours,
    slaStatus,
    status: request.status,
    stages,
    comments: request.comments || [],
    businessProcess: request.leaveType ? 'Leave Management' : request.category,
    workflowVersion: 'ESS-2026.1',
  };
};

export const buildEssWorkflowIntelligence = (input: {
  employee: { employeeId: string; fullName: string; department: string; manager: string; jobTitle?: string };
  requests: EssRequestLike[];
  approvalQueue?: Array<{ id: string; employee: string; type: string; days: number; startDate: string; endDate: string; stage: string }>;
  leaveApprovals?: Array<{ id: string; employee: string; type: string; stage: string; status: string; startDate?: string; endDate?: string }>;
  notifications?: Array<{ id: string; title: string; type: string; status: string; createdAt: string }>;
  serviceCatalog?: Array<{ id: string; label: string; area: string; workflow: string[]; slaHours: number }>;
  auditTrail?: Array<{ at: string; actor: string; action: string; channel?: string; detail?: string }>;
}): WorkflowIntelligence => {
  const catalog = input.serviceCatalog || [];
  const employeeName = input.employee.fullName;
  const department = input.employee.department || 'Unassigned';
  const managerName = input.employee.manager || 'Line Manager';

  const requestRows = input.requests.map((request) =>
    rowFromRequest(request, employeeName, department, managerName, catalog),
  );

  const register = [...requestRows].sort(
    (a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime(),
  );

  const today = new Date().toISOString().slice(0, 10);
  const monthPrefix = today.slice(0, 7);
  const pendingRequests = register.filter((row) => !isTerminal(row.status)).length;
  const awaitingMyAction = (input.approvalQueue?.length || 0) + (input.leaveApprovals?.length || 0);
  const approvedToday = register.filter((row) => /approved/i.test(row.status) && row.submittedAt.slice(0, 10) === today).length;
  const completedThisMonth = register.filter((row) => isTerminal(row.status) && !isRejected(row.status) && row.submittedAt.startsWith(monthPrefix)).length;
  const overdue = register.filter((row) => row.slaStatus === 'Overdue' && !isTerminal(row.status));
  const escalations = overdue.length;
  const onTrack = register.filter((row) => !isTerminal(row.status) && row.slaStatus !== 'Overdue').length;
  const slaCompliancePct = register.length
    ? Math.round(((register.length - overdue.length) / register.length) * 100)
    : 100;

  const avgHours = register.length
    ? Math.round(register.reduce((sum, row) => sum + row.elapsedHours, 0) / register.length)
    : 0;

  const distributionMap = new Map<string, number>();
  register.forEach((row) => distributionMap.set(row.requestType, (distributionMap.get(row.requestType) || 0) + 1));
  const distribution = [...distributionMap.entries()].map(([label, value], index) => ({
    label,
    value,
    color: ['#2563EB', '#22C55E', '#F59E0B', '#7C3AED', '#06B6D4', '#F97316'][index % 6]!,
  }));

  const bottleneckMap = new Map<string, number>();
  register.filter((row) => !isTerminal(row.status)).forEach((row) => {
    bottleneckMap.set(row.currentStage, (bottleneckMap.get(row.currentStage) || 0) + 1);
  });
  const bottlenecks = [...bottleneckMap.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  const pendingActions = [
    ...(input.approvalQueue || []).map((item) => ({
      id: item.id,
      title: `${item.employee} · ${item.type}`,
      status: 'Approval Required',
      owner: item.stage,
      dueLabel: `${item.days} day(s) · ${item.startDate}`,
      severity: 'high' as const,
    })),
    ...overdue.slice(0, 3).map((item) => ({
      id: `esc-${item.id}`,
      title: `SLA breach · ${item.request}`,
      status: 'Escalated',
      owner: item.approver,
      dueLabel: `${item.elapsedHours}h elapsed`,
      severity: 'high' as const,
    })),
    ...register.filter((row) => row.slaStatus === 'At Risk').slice(0, 2).map((item) => ({
      id: `risk-${item.id}`,
      title: item.request,
      status: 'Due Today',
      owner: item.approver,
      dueLabel: `${item.slaHours - item.elapsedHours}h remaining`,
      severity: 'medium' as const,
    })),
  ];

  const auditTimeline = [
    ...(input.auditTrail || []).map((item, index) => ({
      id: `audit-${index}`,
      action: item.action,
      actor: String(item.actor),
      at: item.at,
      comment: item.detail,
      tone: /approv/i.test(item.action) ? 'green' as const : /reject|terminat/i.test(item.action) ? 'red' as const : 'blue' as const,
    })),
    ...register.slice(0, 4).flatMap((row) =>
      row.comments.map((comment, index) => ({
        id: `${row.id}-comment-${index}`,
        action: `${row.requestType} comment`,
        actor: comment.actor,
        at: comment.at,
        comment: comment.comment,
        tone: 'amber' as const,
      })),
    ),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()).slice(0, 12);

  const bottleneck = bottlenecks[0]?.label || 'Line Manager';
  const activeRow = register.find((row) => !isTerminal(row.status)) || register[0] || null;

  return {
    kpis: {
      pendingRequests,
      awaitingMyAction,
      approvedToday,
      slaCompliancePct,
      escalations,
      completedThisMonth,
    },
    kpiTrends: {
      pendingRequests: 0,
      awaitingMyAction: 0,
      approvedToday: 0,
      slaCompliancePct: 0,
      escalations: 0,
      completedThisMonth: 0,
    },
    selectedRequest: activeRow,
    register,
    pendingActions,
    notifications: (input.notifications || [])
      .filter((item) => /approval|workflow|leave|claim/i.test(`${item.title} ${item.type}`))
      .slice(0, 8)
      .map((item) => ({
        id: item.id,
        title: item.title,
        channel: /email/i.test(item.type) ? 'Email' : 'In-App',
        status: item.status,
        createdAt: item.createdAt,
      })),
    auditTimeline,
    slaMonitor: {
      compliancePct: slaCompliancePct,
      averageApprovalHours: avgHours,
      overdueCount: escalations,
      targetHours: workflowDeadlineDays * 8,
    },
    aiInsights: {
      delayPrediction: activeRow
        ? `${Math.max(1, Math.round((activeRow.slaHours - activeRow.elapsedHours) / 8))} business day(s) if ${bottleneck} queue clears`
        : 'No active delays detected',
      likelyCompletion: activeRow
        ? new Date(Date.now() + Math.max(8, activeRow.slaHours - activeRow.elapsedHours) * 3_600_000).toLocaleDateString('en-GB')
        : 'No open requests',
      recommendedEscalation: escalations > 0 ? `Escalate ${escalations} overdue item(s) to HR shared services` : 'No escalation required',
      workloadBalance: awaitingMyAction > 2 ? 'Delegate supervisor reviews to backup approver' : 'Approver workload is balanced',
      suggestedDelegate: managerName || 'Deputy line manager',
      bottleneck: `${bottleneck} stage has the highest pending volume`,
      confidenceScore: slaCompliancePct,
    },
    analytics: {
      approvalTimeTrend: avgHours ? [avgHours] : [],
      distribution,
      bottlenecks,
      monthlyVolume: register.length
        ? (() => {
            const buckets = new Map<string, number>();
            register.forEach((row) => {
              const key = row.submittedAt.slice(0, 7);
              buckets.set(key, (buckets.get(key) || 0) + 1);
            });
            return [...buckets.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-6).map(([, value]) => value);
          })()
        : [],
    },
  };
};
