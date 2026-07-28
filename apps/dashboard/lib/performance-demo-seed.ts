/** Classic bootstrap demo records — strip from stores and UI so workspaces show HRIS-backed data only. */

export const DEMO_EMPLOYEE_IDS = new Set([
  'EMP-1001', 'EMP-1002', 'EMP-1003', 'EMP-1004',
  'EMP-001', 'EMP-002', 'EMP-003', 'EMP-004',
]);
export const DEMO_EMPLOYEE_CODES = new Set([
  'P1001', 'P1002', 'P1003', 'P1004',
  'P001', 'P002', 'P003', 'P004',
]);
export const DEMO_EMPLOYEE_NAMES = new Set([
  'ada okonkwo',
  'chidi bello',
  'ngozi adeyemi',
  'tunde bakare',
  'tunde bekare',
]);
export const DEMO_OBJECTIVE_CODES = new Set(['CO-REV-01', 'CO-OPS-02', 'CO-PEO-03', 'CO-PRO-03']);
export const DEMO_OBJECTIVE_TITLES = new Set([
  'sustainable revenue growth',
  'operational excellence and hse',
  'people capability and engagement',
]);
export const DEMO_GOAL_TITLES = new Set([
  'deliver assigned annual workplan outcomes',
  'improve process quality and stakeholder service',
]);
export const DEMO_KR_TITLES = new Set([
  'primary kpi achievement',
  'quality / compliance milestones',
  'quality/compliance milestones',
]);

export const isDemoEmployee = (
  employeeId?: string | null,
  employeeName?: string | null,
  employeeCode?: string | null,
) => {
  const id = String(employeeId || '').trim().toUpperCase();
  const code = String(employeeCode || '').trim().toUpperCase();
  const name = String(employeeName || '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (DEMO_EMPLOYEE_IDS.has(id) || DEMO_EMPLOYEE_IDS.has(code) || DEMO_EMPLOYEE_CODES.has(code)) return true;
  if (DEMO_EMPLOYEE_NAMES.has(name)) return true;
  for (const demo of DEMO_EMPLOYEE_NAMES) {
    if (name.includes(demo) || demo.includes(name)) return true;
  }
  return false;
};

export const isDemoObjective = (code?: string | null, title?: string | null) => {
  const normalizedCode = String(code || '').trim().toUpperCase();
  const normalizedTitle = String(title || '').trim().toLowerCase().replace(/\s+/g, ' ');
  return DEMO_OBJECTIVE_CODES.has(normalizedCode) || DEMO_OBJECTIVE_TITLES.has(normalizedTitle);
};

export const isDemoGoalTitle = (title?: string | null) => {
  const normalized = String(title || '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (DEMO_GOAL_TITLES.has(normalized)) return true;
  return /deliver assigned annual workplan|improve process quality and stakeholder/i.test(normalized);
};

export const isSeededDemoGoal = (goal: {
  title?: string | null;
  parentObjectiveId?: string | null;
  keyResults?: Array<{ title?: string | null }>;
  description?: string | null;
  employeeId?: string | null;
  employeeName?: string | null;
  employeeCode?: string | null;
}) => {
  if (isDemoEmployee(goal.employeeId, goal.employeeName, goal.employeeCode)) return true;
  if (isDemoGoalTitle(goal.title)) return true;
  if (/measurable individual contribution aligned to company objectives/i.test(String(goal.description || ''))) return true;
  const krTitles = (goal.keyResults || []).map((kr) => String(kr.title || '').trim().toLowerCase());
  if (krTitles.length >= 2 && krTitles.every((title) => DEMO_KR_TITLES.has(title))) return true;
  return false;
};

export const stripDemoPerformanceSeed = <T extends {
  eligibility?: Array<{ employeeId?: string; fullName?: string; employeeCode?: string }>;
  companyObjectives?: Array<{ id: string; code?: string; title?: string }>;
  goals?: Array<{
    id: string;
    title?: string;
    parentObjectiveId?: string;
    description?: string;
    employeeId?: string;
    employeeName?: string;
    employeeCode?: string;
    keyResults?: Array<{ title?: string }>;
  }>;
  checkIns?: Array<{ employeeId?: string; employeeName?: string }>;
  assessments?: Array<{ employeeId?: string; employeeName?: string }>;
  raters?: Array<{ employeeId?: string; employeeName?: string }>;
  calibration?: Array<{ employeeId?: string; employeeName?: string }>;
  results?: Array<{ employeeId?: string; employeeName?: string }>;
  appeals?: Array<{ employeeId?: string; employeeName?: string }>;
  pips?: Array<{ employeeId?: string; employeeName?: string }>;
  developmentPlans?: Array<{ employeeId?: string; employeeName?: string }>;
  recognitions?: Array<{ employeeId?: string; employeeName?: string }>;
  probation?: Array<{ employeeId?: string; employeeName?: string; employeeCode?: string }>;
  tasks?: Array<{ employeeId?: string; employeeName?: string }>;
}>(state: T): T => {
  const objectiveIds = new Set((state.companyObjectives || []).map((row) => row.id));
  const demoObjectiveIds = new Set(
    (state.companyObjectives || [])
      .filter((row) => isDemoObjective(row.code, row.title))
      .map((row) => row.id),
  );
  const demoGoalIds = new Set(
    (state.goals || [])
      .filter((goal) => isSeededDemoGoal(goal)
        || (Boolean(goal.parentObjectiveId) && !objectiveIds.has(goal.parentObjectiveId!) && isDemoGoalTitle(goal.title))
        || (Boolean(goal.parentObjectiveId) && demoObjectiveIds.has(goal.parentObjectiveId!)))
      .map((goal) => goal.id),
  );

  return {
    ...state,
    eligibility: (state.eligibility || []).filter((row) => !isDemoEmployee(row.employeeId, row.fullName, row.employeeCode)),
    companyObjectives: (state.companyObjectives || []).filter((row) => !demoObjectiveIds.has(row.id)),
    goals: (state.goals || []).filter((goal) => !demoGoalIds.has(goal.id)),
    checkIns: (state.checkIns || []).filter((row) => !isDemoEmployee(row.employeeId, row.employeeName)),
    assessments: (state.assessments || []).filter((row) => !isDemoEmployee(row.employeeId, row.employeeName)),
    raters: (state.raters || []).filter((row) => !isDemoEmployee(row.employeeId, row.employeeName)),
    calibration: (state.calibration || []).filter((row) => !isDemoEmployee(row.employeeId, row.employeeName)),
    results: (state.results || []).filter((row) => !isDemoEmployee(row.employeeId, row.employeeName)),
    appeals: (state.appeals || []).filter((row) => !isDemoEmployee(row.employeeId, row.employeeName)),
    pips: (state.pips || []).filter((row) => !isDemoEmployee(row.employeeId, row.employeeName)),
    developmentPlans: (state.developmentPlans || []).filter((row) => !isDemoEmployee(row.employeeId, row.employeeName)),
    recognitions: (state.recognitions || []).filter((row) => !isDemoEmployee(row.employeeId, row.employeeName)),
    probation: (state.probation || []).filter((row) => !isDemoEmployee(row.employeeId, row.employeeName, row.employeeCode)),
    tasks: (state.tasks || []).filter((row) => !isDemoEmployee(row.employeeId, row.employeeName)),
  };
};
