import { getDleEnterpriseDbPool, readEmployeeDirectoryFromDb, type DleEmployeeDirectoryRow } from '@/lib/dle-enterprise-db';
import { normalizePayrollMatchKey } from '@/lib/sage-people-payroll-store';
import { assignEmployeesToSupervisor, readSupervisorAssignments } from '@/lib/supervisor-assignment-store';

const clean = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

const LEADERSHIP_PATTERN = /\b(manager|head|lead|supervisor|director)\b/i;

/** Role-based supervisor overrides within ADMINSTRATION pending manual review for admin/front-office staff. */
export const ADMINSTRATION_ROLE_SUPERVISOR_CODES = {
  drivers: { supervisorCode: 'L2770', employeeCodes: [
    'L0297', 'L1090', 'L1369', 'L1618', 'L1963', 'L2125', 'L2142', 'L2191',
    'L2214', 'L2216', 'L2254', 'L2331', 'L2336', 'L2374', 'L2775', 'L2777',
    'L2779', 'P0309',
  ] },
  security: { supervisorCode: 'P0272', employeeCodes: ['L0263', 'L0862', 'L1714', 'L1986'] },
} as const;

/** Departments that need manual supervisor review before any auto-assignment runs. */
const DEPARTMENTS_PENDING_MANUAL_REVIEW = new Set([
  'adminstration',
  'administration',
]);

/** Explicit department → supervisor overrides where org data is incomplete. */
export const explicitDepartmentSupervisorCode = (department: string) => {
  const normalized = clean(department).toLowerCase().replace(/\s+/g, ' ');
  return DEPARTMENT_SUPERVISOR_CODES[normalized] || null;
};

/** Explicit department → supervisor overrides where org data is incomplete. */
const DEPARTMENT_SUPERVISOR_CODES: Record<string, string> = {
  'information technology': 'P0146',
  'it & enterprise systems': 'P0146',
  'it and enterprise systems': 'P0146',
  'security': 'P0272',
  'security & community liaison': 'P0272',
};

export type DepartmentReportingSyncRow = {
  employeeCode: string;
  employeeName: string;
  department: string;
  employmentType: string;
  previousReportingManager: string | null;
  supervisorCode: string;
  supervisorName: string;
  reason: string;
};

export type DepartmentSupervisorSummary = {
  department: string;
  employeeCount: number;
  missingManagerCount: number;
  supervisorCode: string | null;
  supervisorName: string | null;
  resolution: string;
};

export type DepartmentReportingSyncResult = {
  generatedAt: string;
  dryRun: boolean;
  departmentsReviewed: number;
  employeesReviewed: number;
  employeesNeedingAssignment: number;
  employeesUpdated: number;
  skippedOutOfScope: number;
  departmentsWithoutSupervisor: string[];
  departmentSummaries: DepartmentSupervisorSummary[];
  planned: DepartmentReportingSyncRow[];
  assignmentBatch: string | null;
};

const normalizeDepartment = (value: string) => clean(value).toLowerCase().replace(/\s+/g, ' ');

const isInactive = (status: string) => /inactive|terminated|resigned|retired|deceased|suspend/i.test(clean(status));

const inScopeEmployee = (employee: DleEmployeeDirectoryRow) => {
  const employmentType = clean(employee.employmentType).toLowerCase();
  const code = clean(employee.employeeCode || employee.employeeId).toUpperCase();
  if (
    employmentType.includes('permanent')
    || employmentType === 'lumpsum'
    || employmentType.includes('contract')
    || employmentType.includes('nysc')
    || employmentType === 'it'
  ) {
    return true;
  }
  return /^(P|L|NYSC|N|C)\d/i.test(code);
};

const leadershipScore = (employee: DleEmployeeDirectoryRow) => {
  const title = `${clean(employee.jobTitle)} ${clean(employee.designation)}`.toLowerCase();
  if (/\bsecurity\b/.test(title) && /\bmanager\b/i.test(title)) return 0;
  if (!LEADERSHIP_PATTERN.test(title)) return 0;
  if (/\b(ag\.|acting)\b.*\bmanager\b/i.test(title) || /\bit manager\b/i.test(title)) return 100;
  if (/\bmanager\b/i.test(title)) return 80;
  if (/\bhead\b/i.test(title)) return 70;
  if (/\blead\b/i.test(title)) return 60;
  if (/\bsupervisor\b/i.test(title)) return 50;
  if (/\bdirector\b/i.test(title)) return 40;
  return 10;
};

const isPermanentLikeSupervisor = (employee: DleEmployeeDirectoryRow) => {
  const code = clean(employee.employeeCode || employee.employeeId).toUpperCase();
  const type = clean(employee.employmentType).toLowerCase();
  if (/^C\d/.test(code)) return leadershipScore(employee) >= 50;
  return type.includes('permanent') || type === 'lumpsum' || /^P\d/.test(code) || leadershipScore(employee) > 0;
};

/** Department-wide default supervisor must be permanent or lumpsum leadership (P/L), not contract staff. */
const isDepartmentHeadCandidate = (employee: DleEmployeeDirectoryRow) => {
  const code = clean(employee.employeeCode || employee.employeeId).toUpperCase();
  if (/^P\d/.test(code) || /^L\d/.test(code)) return true;
  const type = clean(employee.employmentType).toLowerCase();
  return (type.includes('permanent') || type === 'lumpsum') && leadershipScore(employee) > 0;
};

const employeeCodeFromReference = (reference: string) => {
  const value = clean(reference);
  if (!value) return '';
  const prefixed = value.match(/^([A-Z]{0,5}0*\d+)\s*-/i);
  if (prefixed?.[1]) return prefixed[1].toUpperCase().replace(/^0+/, (digits) => (digits ? digits : '0'));
  const embedded = value.match(/\b(P\d+|L\d+|NYSC\d+|C\d+)\b/i);
  return embedded?.[1]?.toUpperCase() || '';
};

const namesMatch = (left: string, right: string) => {
  const a = clean(left).toLowerCase();
  const b = clean(right).toLowerCase();
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
};

const referenceMatchesEmployee = (employee: DleEmployeeDirectoryRow, reference: string) => {
  if (!reference) return false;
  const code = clean(employee.employeeCode || employee.employeeId).toUpperCase();
  const refCode = employeeCodeFromReference(reference).toUpperCase();
  if (refCode && code === refCode) return true;
  if (namesMatch(employee.fullName, reference)) return true;
  const embeddedName = reference.includes(' - ') ? clean(reference.split(' - ').slice(1).join(' - ')) : '';
  return Boolean(embeddedName && namesMatch(employee.fullName, embeddedName));
};

const reportingManagerMatchesSupervisor = (
  reportingManager: string,
  supervisor: DleEmployeeDirectoryRow,
) => {
  const managerRef = clean(reportingManager);
  if (!managerRef) return false;
  const supervisorLabel = `${clean(supervisor.employeeCode)} - ${clean(supervisor.fullName)}`;
  if (managerRef === supervisorLabel) return true;

  const managerCode = employeeCodeFromReference(managerRef);
  const supervisorCode = normalizePayrollMatchKey(supervisor.employeeCode || supervisor.employeeId);
  if (managerCode && supervisorCode && normalizePayrollMatchKey(managerCode) === supervisorCode) return true;

  const managerName = managerRef.includes(' - ') ? clean(managerRef.split(' - ').slice(1).join(' - ')) : managerRef;
  const supervisorName = clean(supervisor.fullName).toLowerCase();
  const normalizedManagerName = managerName.toLowerCase();
  return Boolean(
    normalizedManagerName
    && (supervisorName === normalizedManagerName || supervisorName.includes(normalizedManagerName) || normalizedManagerName.includes(supervisorName)),
  );
};

const readOrganizationDepartmentLeaders = async () => {
  const leaders = new Map<string, string>();
  const pool = await getDleEnterpriseDbPool();
  if (!pool) return leaders;
  try {
    const result = await pool.request().query(`
SELECT [Name], [Leader]
FROM [hris].[OrganizationDepartments]
WHERE [SourceSystem] IN (N'DLE Enterprise', N'DLE Enterprise HRIS')
  AND LTRIM(RTRIM(ISNULL([Leader], N''))) <> N'';`);
    for (const row of result.recordset || []) {
      const department = clean(row.Name);
      const leader = clean(row.Leader);
      if (department && leader) leaders.set(normalizeDepartment(department), leader);
    }
  } catch {
    // OrganizationDepartments may not exist in every environment.
  }
  return leaders;
};

const buildSupervisorAssignmentMap = async (allEmployees: DleEmployeeDirectoryRow[]) => {
  const assignments = await readSupervisorAssignments();
  const byEmployeeCode = new Map<string, DleEmployeeDirectoryRow>();
  const employeeByCode = new Map(
    allEmployees.map((employee) => [clean(employee.employeeCode || employee.employeeId).toUpperCase(), employee]),
  );
  for (const assignment of assignments) {
    const employeeCode = clean(assignment.employeeCode).toUpperCase();
    const supervisorCode = clean(assignment.supervisorEmployeeCode).toUpperCase();
    if (!employeeCode || !supervisorCode) continue;
    const supervisor = employeeByCode.get(supervisorCode)
      || allEmployees.find((employee) => referenceMatchesEmployee(employee, supervisorCode))
      || null;
    if (supervisor) byEmployeeCode.set(employeeCode, supervisor);
  }
  return byEmployeeCode;
};

const resolveDepartmentSupervisor = (
  department: string,
  employeesInDepartment: DleEmployeeDirectoryRow[],
  allEmployees: DleEmployeeDirectoryRow[],
  orgLeaders: Map<string, string>,
): { supervisor: DleEmployeeDirectoryRow | null; resolution: string } => {
  const departmentKey = normalizeDepartment(department);
  const activeInDepartment = employeesInDepartment.filter((employee) => !isInactive(employee.status));

  const overrideCode = DEPARTMENT_SUPERVISOR_CODES[departmentKey];
  if (overrideCode) {
    const override = allEmployees.find((employee) => clean(employee.employeeCode).toUpperCase() === overrideCode);
    if (override && !isInactive(override.status)) {
      return { supervisor: override, resolution: 'Explicit department supervisor mapping' };
    }
  }

  const orgLeaderRef = orgLeaders.get(departmentKey);
  if (orgLeaderRef) {
    const orgLeader = allEmployees.find((employee) => referenceMatchesEmployee(employee, orgLeaderRef));
    if (orgLeader && !isInactive(orgLeader.status) && isDepartmentHeadCandidate(orgLeader)) {
      return { supervisor: orgLeader, resolution: 'Organization department leader' };
    }
  }

  const leadershipCandidates = activeInDepartment
    .filter((employee) => isDepartmentHeadCandidate(employee))
    .map((employee) => ({ employee, score: leadershipScore(employee) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.employee.fullName.localeCompare(b.employee.fullName));
  if (leadershipCandidates.length) {
    return {
      supervisor: leadershipCandidates[0].employee,
      resolution: `Department ${leadershipCandidates[0].score >= 80 ? 'manager' : leadershipCandidates[0].score >= 60 ? 'lead' : 'supervisor'} from job title`,
    };
  }

  const managerCounts = new Map<string, { count: number; code: string }>();
  for (const employee of activeInDepartment) {
    const managerRef = clean(employee.managerName);
    if (!managerRef) continue;
    const managerCode = employeeCodeFromReference(managerRef) || managerRef;
    const key = normalizePayrollMatchKey(managerCode) || managerRef.toLowerCase();
    const current = managerCounts.get(key) || { count: 0, code: managerCode };
    current.count += 1;
    managerCounts.set(key, current);
  }
  const dominant = [...managerCounts.entries()].sort((a, b) => b[1].count - a[1].count)[0];
  if (dominant) {
    const supervisor = allEmployees.find((employee) => {
      if (!isDepartmentHeadCandidate(employee)) return false;
      const keys = [employee.employeeCode, employee.employeeId, employee.fullName].map((value) => normalizePayrollMatchKey(value));
      return keys.includes(dominant[0]) || reportingManagerMatchesSupervisor(dominant[1].code, employee);
    });
    if (supervisor && !isInactive(supervisor.status)) {
      return { supervisor, resolution: 'Dominant reporting manager in department' };
    }
  }

  const departmentHeadName = activeInDepartment.map((employee) => clean(employee.departmentHead)).find(Boolean);
  if (departmentHeadName) {
    const head = allEmployees.find((employee) => namesMatch(employee.fullName, departmentHeadName));
    if (head && !isInactive(head.status)) {
      return { supervisor: head, resolution: 'Department head field' };
    }
  }

  return { supervisor: null, resolution: 'No supervisor resolved' };
};

export async function auditDepartmentReportingManagers(): Promise<DepartmentReportingSyncResult> {
  const employees = (await readEmployeeDirectoryFromDb()) || [];
  return await buildDepartmentReportingSyncPlan(employees, true);
}

export async function syncDepartmentReportingManagers(input: {
  dryRun?: boolean;
  performedBy?: string;
  departments?: string[];
} = {}): Promise<DepartmentReportingSyncResult> {
  const employees = (await readEmployeeDirectoryFromDb()) || [];
  const plan = await buildDepartmentReportingSyncPlan(employees, Boolean(input.dryRun), input.departments);
  if (input.dryRun || plan.planned.length === 0) return plan;

  const grouped = new Map<string, DepartmentReportingSyncRow[]>();
  for (const row of plan.planned) {
    const bucket = grouped.get(row.supervisorCode) || [];
    bucket.push(row);
    grouped.set(row.supervisorCode, bucket);
  }

  let assignmentBatch: string | null = null;
  let employeesUpdated = 0;
  for (const [supervisorCode, rows] of grouped.entries()) {
    const result = await assignEmployeesToSupervisor({
      supervisorEmployeeCode: supervisorCode,
      employeeCodes: rows.map((row) => row.employeeCode),
      assignmentGroup: 'Department Reporting Line',
      assignmentBatch: assignmentBatch || undefined,
      reason: 'Department/unit reporting manager alignment for leave and approval routing.',
      performedBy: clean(input.performedBy) || 'department-reporting-sync',
      sourceRows: rows.map((row) => ({
        employeeCode: row.employeeCode,
        sourceLabel: row.employeeName,
        matchConfidence: 'DepartmentSupervisorRule',
        matchNote: row.reason,
      })),
    });
    assignmentBatch = result.assignmentBatch;
    employeesUpdated += rows.length;
  }

  return {
    ...plan,
    dryRun: false,
    employeesUpdated,
    assignmentBatch,
  };
}

async function buildDepartmentReportingSyncPlan(
  employees: DleEmployeeDirectoryRow[],
  dryRun: boolean,
  departmentFilter?: string[],
): Promise<DepartmentReportingSyncResult> {
  const filter = new Set((departmentFilter || []).map(normalizeDepartment).filter(Boolean));
  const activeEmployees = employees.filter((employee) => !isInactive(employee.status));
  const orgLeaders = await readOrganizationDepartmentLeaders();
  const supervisorAssignments = await buildSupervisorAssignmentMap(activeEmployees);
  const departments = new Map<string, DleEmployeeDirectoryRow[]>();

  let skippedOutOfScope = 0;

  for (const employee of activeEmployees) {
    const department = clean(employee.department);
    if (!department) {
      skippedOutOfScope += 1;
      continue;
    }
    if (!inScopeEmployee(employee)) {
      skippedOutOfScope += 1;
      continue;
    }
    if (filter.size && !filter.has(normalizeDepartment(department))) continue;
    if (DEPARTMENTS_PENDING_MANUAL_REVIEW.has(normalizeDepartment(department))) continue;
    const bucket = departments.get(department) || [];
    bucket.push(employee);
    departments.set(department, bucket);
  }

  const planned: DepartmentReportingSyncRow[] = [];
  const departmentsWithoutSupervisor: string[] = [];
  const departmentSummaries: DepartmentSupervisorSummary[] = [];

  for (const [department, departmentEmployees] of departments.entries()) {
    const { supervisor, resolution } = resolveDepartmentSupervisor(department, departmentEmployees, activeEmployees, orgLeaders);
    const missingManagerCount = departmentEmployees.filter((employee) => !clean(employee.managerName)).length;

    departmentSummaries.push({
      department,
      employeeCount: departmentEmployees.length,
      missingManagerCount,
      supervisorCode: supervisor ? clean(supervisor.employeeCode) : null,
      supervisorName: supervisor ? clean(supervisor.fullName) : null,
      resolution,
    });

    if (!supervisor) {
      departmentsWithoutSupervisor.push(department);
      continue;
    }

    for (const employee of departmentEmployees) {
      const employeeCode = clean(employee.employeeCode || employee.employeeId).toUpperCase();
      if (employeeCode === clean(supervisor.employeeCode).toUpperCase()) continue;

      const assignedSupervisor = supervisorAssignments.get(employeeCode);
      const targetSupervisor = assignedSupervisor || supervisor;
      const hasManager = Boolean(clean(employee.managerName));
      const explicitDepartment = Boolean(DEPARTMENT_SUPERVISOR_CODES[normalizeDepartment(department)]);
      const needsExplicitSupervisor = explicitDepartment && !reportingManagerMatchesSupervisor(clean(employee.managerName), targetSupervisor);
      const needsAssignmentSupervisor = assignedSupervisor && !reportingManagerMatchesSupervisor(clean(employee.managerName), assignedSupervisor);
      const needsManager = !hasManager;

      if (!needsManager && !needsExplicitSupervisor && !needsAssignmentSupervisor) continue;
      if (needsManager && !assignedSupervisor && !isDepartmentHeadCandidate(targetSupervisor)) continue;

      const reason = needsAssignmentSupervisor
        ? 'Trade supervisor assignment alignment'
        : needsExplicitSupervisor
          ? 'Explicit department supervisor mapping'
          : 'Missing reporting manager for department/unit';

      planned.push({
        employeeCode: clean(employee.employeeCode || employee.employeeId),
        employeeName: clean(employee.fullName),
        department,
        employmentType: clean(employee.employmentType),
        previousReportingManager: clean(employee.managerName) || null,
        supervisorCode: clean(targetSupervisor.employeeCode || targetSupervisor.employeeId),
        supervisorName: clean(targetSupervisor.fullName),
        reason,
      });
    }
  }

  departmentSummaries.sort((a, b) => a.department.localeCompare(b.department));

  return {
    generatedAt: new Date().toISOString(),
    dryRun,
    departmentsReviewed: departments.size,
    employeesReviewed: [...departments.values()].reduce((sum, rows) => sum + rows.length, 0),
    employeesNeedingAssignment: planned.length,
    employeesUpdated: 0,
    skippedOutOfScope,
    departmentsWithoutSupervisor: departmentsWithoutSupervisor.sort((a, b) => a.localeCompare(b)),
    departmentSummaries,
    planned: planned.sort((a, b) => a.department.localeCompare(b.department) || a.employeeCode.localeCompare(b.employeeCode)),
    assignmentBatch: null,
  };
}
