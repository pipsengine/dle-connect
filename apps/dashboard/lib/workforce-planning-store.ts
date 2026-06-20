import sql from 'mssql';
import { getDleEnterpriseDbPool, type DleEmployeeDirectoryRow } from '@/lib/dle-enterprise-db';
import type { HealthStatus, StructureInsight } from '@/lib/organization-data';
import { payrollDataSourceInfo, readPayrollEmployees } from '@/lib/payroll-employee-source';

export type WorkforceRequestType = 'Add Headcount' | 'Backfill Gap' | 'Temporary Coverage' | 'Structure Review';
export type WorkforceRequestStatus = 'Submitted' | 'Under Review' | 'Approved' | 'Declined';
export type WorkforcePlanningPriority = 'Immediate' | 'Planned' | 'Monitor';
export type WorkforcePositionType = 'Permanent' | 'Contract' | 'Project' | 'Temporary';
export type WorkforcePositionStatus = 'Filled' | 'Vacant' | 'Frozen' | 'Under Review';
export type WorkforceCriticality = 'Critical' | 'Core' | 'Support';

export type WorkforcePlanningRole = {
  id: string;
  code: string;
  title: string;
  gradeCode: string;
  positionType: WorkforcePositionType;
  positionStatus: WorkforcePositionStatus;
  criticality: WorkforceCriticality;
  replacementPriority: WorkforcePlanningPriority;
  incumbentName: string | null;
  openDays: number;
  fte: number;
  benchmarkSalaryNgn: number;
  healthStatus: HealthStatus;
};

export type WorkforcePlanRecord = {
  id: string;
  businessUnit: string;
  department: string;
  location: string;
  costCenter: string;
  approvedPositions: number;
  approvedFte: number;
  filledFte: number;
  openDemandFte: number;
  vacantFte: number;
  frozenFte: number;
  reviewFte: number;
  vacancyRatePct: number;
  criticalPositions: number;
  criticalGapRoles: number;
  immediateBackfills: number;
  averageOpenDays: number;
  successionCoveragePct: number;
  attritionRiskPct: number;
  approvalCoveragePct: number;
  payrollRunRateNgn: number;
  openBudgetNgn: number;
  standardizationPct: number;
  healthStatus: HealthStatus;
  planningPriority: WorkforcePlanningPriority;
  employmentMix: Array<{ label: string; count: number }>;
  gradeMix: Array<{ label: string; count: number }>;
  topRisks: string[];
  recommendedAction: string;
  roles: WorkforcePlanningRole[];
};

export type WorkforcePlanningRequestRecord = {
  id: string;
  planId: string;
  businessUnit: string;
  department: string;
  location: string;
  requestType: WorkforceRequestType;
  requestedFte: number;
  targetQuarter: string;
  requestedBy: string;
  justification: string;
  impactSummary: string;
  projectedApprovedFte: number;
  projectedFilledFte: number;
  projectedGapFte: number;
  incrementalBudgetNgn: number;
  status: WorkforceRequestStatus;
  createdAt: string;
  updatedAt?: string;
};

export type WorkforcePlanningData = {
  generatedAt: string;
  dataSource: ReturnType<typeof payrollDataSourceInfo> & {
    planningSource: 'Sage Payroll Migration' | 'DLE_Enterprise HRIS' | 'Local HRIS payroll cache';
    migratedPlanCount: number;
    migrationWarning: string | null;
    independence: string;
  };
  summary: {
    totalPlans: number;
    totalApprovedFte: number;
    totalFilledFte: number;
    totalOpenDemandFte: number;
    vacancyRatePct: number;
    criticalGapRoles: number;
    immediateBackfills: number;
    openBudgetNgn: number;
    avgSuccessionCoverage: number;
    avgAttritionRisk: number;
    payrollRunRateNgn: number;
    reviewFte: number;
  };
  filterOptions: {
    businessUnits: string[];
    departments: string[];
    locations: string[];
    costCenters: string[];
    planningPriorities: WorkforcePlanningPriority[];
    healthStatuses: HealthStatus[];
  };
  plans: WorkforcePlanRecord[];
  insights: StructureInsight[];
};

type DbPlanRow = {
  Id: string;
  PlanJson: string;
};

type DbRequestRow = {
  Id: string;
  PlanId: string;
  BusinessUnit: string;
  Department: string;
  Location: string;
  RequestType: WorkforceRequestType;
  RequestedFte: number;
  TargetQuarter: string;
  RequestedBy: string;
  Justification: string;
  ImpactSummary: string;
  ProjectedApprovedFte: number;
  ProjectedFilledFte: number;
  ProjectedGapFte: number;
  IncrementalBudgetNgn: number;
  RequestStatus: WorkforceRequestStatus;
  CreatedAt: Date | string;
  UpdatedAt: Date | string | null;
};

const SOURCE_SYSTEM = 'Sage Payroll Migration';
const dbReady = { value: false };

const clean = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
const slug = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'unassigned';
const round1 = (value: number) => Math.round(value * 10) / 10;
const roundMoney = (value: number) => Math.round(value * 100) / 100;
const uniqueSorted = (values: string[]) => Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b));

const average = (values: number[]) => {
  if (!values.length) return 0;
  return round1(values.reduce((sum, value) => sum + value, 0) / values.length);
};

const countMix = (values: string[]) => {
  const counts = new Map<string, number>();
  for (const value of values.map((item) => clean(item) || 'Unassigned')) counts.set(value, (counts.get(value) || 0) + 1);
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
};

const isInactive = (employee: DleEmployeeDirectoryRow) => {
  const status = clean(employee.status).toLowerCase();
  return ['terminated', 'resigned', 'retired', 'inactive', 'exited'].some((word) => status.includes(word));
};

const monthlyPayroll = (employee: DleEmployeeDirectoryRow) => {
  const sageGross = employee.sagePayrollEarnings?.reduce((sum, line) => sum + Number(line.amount || 0), 0) || 0;
  if (sageGross > 0) return sageGross;
  const period = Number(employee.periodSalary || 0);
  if (period > 0) return period;
  const annual = Number(employee.annualSalary || 0);
  if (annual > 0) return annual / 12;
  const ratePerDay = Number(employee.ratePerDay || 0);
  if (ratePerDay > 0) return ratePerDay * 22;
  const ratePerHour = Number(employee.ratePerHour || 0);
  if (ratePerHour > 0) return ratePerHour * Number(employee.hoursPerPeriod || 176);
  return 0;
};

const positionTypeFor = (employee: DleEmployeeDirectoryRow): WorkforcePositionType => {
  const text = `${employee.employmentType} ${employee.employeeCategory} ${employee.staffCategory}`.toLowerCase();
  if (text.includes('daily')) return 'Project';
  if (text.includes('contract') || text.includes('lumpsum')) return 'Contract';
  if (text.includes('temporary') || text.includes('casual')) return 'Temporary';
  return 'Permanent';
};

const criticalityFor = (employee: DleEmployeeDirectoryRow): WorkforceCriticality => {
  const text = `${employee.jobTitle} ${employee.designation} ${employee.salaryGrade} ${employee.jobGrade}`.toLowerCase();
  if (/(chief|director|manager|head|lead|supervisor|foreman|mgt|smgt|snm|critical|safety|qa\/qc|quality)/.test(text)) return 'Critical';
  if (/(welder|fitter|operator|technician|engineer|rigger|crane|painter|blaster|mechanic)/.test(text)) return 'Core';
  return 'Support';
};

const hasManager = (employee: DleEmployeeDirectoryRow) => Boolean(clean(employee.managerName) || clean(employee.functionalManager) || clean(employee.departmentHead));
const hasPayroll = (employee: DleEmployeeDirectoryRow) => monthlyPayroll(employee) > 0 || Number(employee.ratePerDay || 0) > 0 || Number(employee.ratePerHour || 0) > 0;

const roleHealth = (employee: DleEmployeeDirectoryRow): HealthStatus => {
  if (!clean(employee.jobTitle) || !clean(employee.salaryGrade) || !hasPayroll(employee)) return 'Critical';
  if (!hasManager(employee) || !clean(employee.location)) return 'Needs Attention';
  return 'Healthy';
};

const positionStatusFor = (employee: DleEmployeeDirectoryRow): WorkforcePositionStatus => {
  const health = roleHealth(employee);
  if (health !== 'Healthy') return 'Under Review';
  return 'Filled';
};

const successionCoverageFor = (rows: DleEmployeeDirectoryRow[]) => round1((rows.filter(hasManager).length / Math.max(rows.length, 1)) * 100);
const attritionRiskFor = (rows: DleEmployeeDirectoryRow[]) => {
  const highRisk = rows.filter((employee) => {
    const years = Number(employee.yearsOfService || 0);
    return !hasManager(employee) || !hasPayroll(employee) || years >= 20;
  }).length;
  return round1((highRisk / Math.max(rows.length, 1)) * 100);
};
const approvalCoverageFor = (rows: DleEmployeeDirectoryRow[]) => round1((rows.filter((employee) => hasManager(employee) && clean(employee.hrBusinessPartner)).length / Math.max(rows.length, 1)) * 100);
const standardizationFor = (rows: DleEmployeeDirectoryRow[]) =>
  round1((rows.filter((employee) => clean(employee.jobTitle) && clean(employee.salaryGrade || employee.jobGrade) && clean(employee.department)).length / Math.max(rows.length, 1)) * 100);

const planningPriorityFor = (health: HealthStatus, reviewFte: number, attritionRiskPct: number): WorkforcePlanningPriority => {
  if (health === 'Critical' || reviewFte >= 5 || attritionRiskPct >= 25) return 'Immediate';
  if (health === 'Needs Attention' || reviewFte > 0 || attritionRiskPct >= 12) return 'Planned';
  return 'Monitor';
};

const healthFor = (reviewFte: number, successionCoveragePct: number, attritionRiskPct: number, standardizationPct: number): HealthStatus => {
  if (reviewFte >= 5 || successionCoveragePct < 60 || attritionRiskPct >= 25 || standardizationPct < 70) return 'Critical';
  if (reviewFte > 0 || successionCoveragePct < 80 || attritionRiskPct >= 12 || standardizationPct < 90) return 'Needs Attention';
  return 'Healthy';
};

const recommendedActionFor = (priority: WorkforcePlanningPriority) => {
  if (priority === 'Immediate') return 'Resolve missing structure, manager, payroll, and critical role readiness issues before the next planning cycle.';
  if (priority === 'Planned') return 'Schedule workforce review actions, confirm ownership, and track readiness improvements through HR and departmental planning.';
  return 'Maintain current workforce baseline and monitor readiness, cost, and capacity indicators monthly.';
};

const buildRisks = (rows: DleEmployeeDirectoryRow[], reviewFte: number, successionCoveragePct: number, attritionRiskPct: number, standardizationPct: number) => {
  const risks: string[] = [];
  const missingManagers = rows.filter((employee) => !hasManager(employee)).length;
  const missingPayroll = rows.filter((employee) => !hasPayroll(employee)).length;
  const missingTitles = rows.filter((employee) => !clean(employee.jobTitle)).length;

  if (reviewFte > 0) risks.push(`${reviewFte} employee${reviewFte === 1 ? '' : 's'} require planning review.`);
  if (missingManagers > 0) risks.push(`${missingManagers} employee${missingManagers === 1 ? '' : 's'} have no manager coverage.`);
  if (missingPayroll > 0) risks.push(`${missingPayroll} employee${missingPayroll === 1 ? '' : 's'} have incomplete payroll cost setup.`);
  if (missingTitles > 0) risks.push(`${missingTitles} employee${missingTitles === 1 ? '' : 's'} have incomplete job title setup.`);
  if (successionCoveragePct < 80) risks.push(`Succession/manager coverage is below target at ${successionCoveragePct}%.`);
  if (attritionRiskPct >= 12) risks.push(`Workforce risk index is elevated at ${attritionRiskPct}%.`);
  if (standardizationPct < 90) risks.push(`Structure standardization is ${standardizationPct}%.`);

  return risks.slice(0, 4);
};

const buildPlanFromRows = (rows: DleEmployeeDirectoryRow[]): WorkforcePlanRecord => {
  const first = rows[0];
  const businessUnit = clean(first.businessUnit) || 'DLE';
  const department = clean(first.department) || 'Unassigned Department';
  const location = clean(first.projectSite) || clean(first.workLocation) || clean(first.officeLocation) || clean(first.location) || 'Unassigned Location';
  const costCenter = clean(first.costCenter) || clean(first.department) || 'Unassigned';
  const roles = rows
    .map((employee) => {
      const healthStatus = roleHealth(employee);
      const status = positionStatusFor(employee);
      const payroll = monthlyPayroll(employee);
      return {
        id: clean(employee.employeeId) || clean(employee.employeeCode),
        code: clean(employee.employeeCode) || clean(employee.employeeId),
        title: clean(employee.jobTitle) || clean(employee.designation) || 'Unassigned Job Title',
        gradeCode: clean(employee.salaryGrade) || clean(employee.jobGrade) || clean(employee.employeeCategory) || 'Unassigned',
        positionType: positionTypeFor(employee),
        positionStatus: status,
        criticality: criticalityFor(employee),
        replacementPriority: status === 'Under Review' && criticalityFor(employee) === 'Critical' ? 'Immediate' : status === 'Under Review' ? 'Planned' : 'Monitor',
        incumbentName: clean(employee.fullName) || null,
        openDays: 0,
        fte: 1,
        benchmarkSalaryNgn: roundMoney(payroll),
        healthStatus,
      } satisfies WorkforcePlanningRole;
    })
    .sort((a, b) => {
      if (a.positionStatus !== b.positionStatus) return b.positionStatus.localeCompare(a.positionStatus);
      if (a.criticality !== b.criticality) return a.criticality.localeCompare(b.criticality);
      return a.title.localeCompare(b.title);
    });

  const approvedPositions = rows.length;
  const approvedFte = rows.length;
  const filledFte = rows.filter((row) => !isInactive(row)).length;
  const reviewFte = roles.filter((role) => role.positionStatus === 'Under Review').length;
  const successionCoveragePct = successionCoverageFor(rows);
  const attritionRiskPct = attritionRiskFor(rows);
  const approvalCoveragePct = approvalCoverageFor(rows);
  const standardizationPct = standardizationFor(rows);
  const healthStatus = healthFor(reviewFte, successionCoveragePct, attritionRiskPct, standardizationPct);
  const planningPriority = planningPriorityFor(healthStatus, reviewFte, attritionRiskPct);
  const payrollRunRateNgn = roundMoney(rows.reduce((sum, employee) => sum + monthlyPayroll(employee), 0));
  const openDemandFte = reviewFte;
  const openBudgetNgn = roundMoney(roles.filter((role) => role.positionStatus === 'Under Review').reduce((sum, role) => sum + role.benchmarkSalaryNgn, 0));
  const criticalPositions = roles.filter((role) => role.criticality === 'Critical').length;
  const criticalGapRoles = roles.filter((role) => role.criticality === 'Critical' && role.positionStatus === 'Under Review').length;

  return {
    id: `wfp-${slug(businessUnit)}-${slug(department)}-${slug(location)}-${slug(costCenter)}`,
    businessUnit,
    department,
    location,
    costCenter,
    approvedPositions,
    approvedFte,
    filledFte,
    openDemandFte,
    vacantFte: 0,
    frozenFte: 0,
    reviewFte,
    vacancyRatePct: approvedFte ? round1((openDemandFte / approvedFte) * 100) : 0,
    criticalPositions,
    criticalGapRoles,
    immediateBackfills: roles.filter((role) => role.replacementPriority === 'Immediate').length,
    averageOpenDays: 0,
    successionCoveragePct,
    attritionRiskPct,
    approvalCoveragePct,
    payrollRunRateNgn,
    openBudgetNgn,
    standardizationPct,
    healthStatus,
    planningPriority,
    employmentMix: countMix(rows.map((row) => clean(row.employmentType) || clean(row.employeeCategory))),
    gradeMix: countMix(rows.map((row) => clean(row.salaryGrade) || clean(row.jobGrade))),
    topRisks: buildRisks(rows, reviewFte, successionCoveragePct, attritionRiskPct, standardizationPct),
    recommendedAction: recommendedActionFor(planningPriority),
    roles,
  };
};

const buildPlansFromEmployees = (employees: DleEmployeeDirectoryRow[]) => {
  const groups = new Map<string, DleEmployeeDirectoryRow[]>();
  for (const employee of employees.filter((row) => !isInactive(row))) {
    const businessUnit = clean(employee.businessUnit) || 'DLE';
    const department = clean(employee.department) || 'Unassigned Department';
    const location = clean(employee.projectSite) || clean(employee.workLocation) || clean(employee.officeLocation) || clean(employee.location) || 'Unassigned Location';
    const costCenter = clean(employee.costCenter) || clean(employee.department) || 'Unassigned';
    const key = [businessUnit, department, location, costCenter].join('||');
    groups.set(key, [...(groups.get(key) || []), employee]);
  }

  return [...groups.values()]
    .map(buildPlanFromRows)
    .sort((a, b) => {
      const priorityOrder: WorkforcePlanningPriority[] = ['Immediate', 'Planned', 'Monitor'];
      const priorityCompare = priorityOrder.indexOf(a.planningPriority) - priorityOrder.indexOf(b.planningPriority);
      if (priorityCompare !== 0) return priorityCompare;
      if (b.openDemandFte !== a.openDemandFte) return b.openDemandFte - a.openDemandFte;
      return a.department.localeCompare(b.department);
    });
};

const rowToPlan = (row: DbPlanRow): WorkforcePlanRecord => JSON.parse(row.PlanJson) as WorkforcePlanRecord;

const rowToRequest = (row: DbRequestRow): WorkforcePlanningRequestRecord => ({
  id: row.Id,
  planId: row.PlanId,
  businessUnit: row.BusinessUnit,
  department: row.Department,
  location: row.Location,
  requestType: row.RequestType,
  requestedFte: Number(row.RequestedFte || 0),
  targetQuarter: row.TargetQuarter,
  requestedBy: row.RequestedBy,
  justification: row.Justification,
  impactSummary: row.ImpactSummary,
  projectedApprovedFte: Number(row.ProjectedApprovedFte || 0),
  projectedFilledFte: Number(row.ProjectedFilledFte || 0),
  projectedGapFte: Number(row.ProjectedGapFte || 0),
  incrementalBudgetNgn: Number(row.IncrementalBudgetNgn || 0),
  status: row.RequestStatus,
  createdAt: new Date(row.CreatedAt).toISOString(),
  updatedAt: row.UpdatedAt ? new Date(row.UpdatedAt).toISOString() : undefined,
});

const ensureDb = async () => {
  const pool = await getDleEnterpriseDbPool();
  if (!pool) throw new Error('DLE Enterprise database is not configured. Workforce planning requires HRIS database persistence for production use.');
  if (!dbReady.value) {
    await pool.request().query(`
IF SCHEMA_ID(N'hris') IS NULL EXEC(N'CREATE SCHEMA [hris]');
IF OBJECT_ID(N'[hris].[OrganizationWorkforcePlans]', N'U') IS NULL
CREATE TABLE [hris].[OrganizationWorkforcePlans] (
  [Id] NVARCHAR(220) NOT NULL CONSTRAINT [PK_OrganizationWorkforcePlans] PRIMARY KEY,
  [SourceSystem] NVARCHAR(80) NOT NULL,
  [BusinessUnit] NVARCHAR(180) NOT NULL,
  [Department] NVARCHAR(180) NOT NULL,
  [Location] NVARCHAR(180) NOT NULL,
  [CostCenter] NVARCHAR(180) NOT NULL,
  [EmployeeCount] INT NOT NULL,
  [ApprovedFte] DECIMAL(18,2) NOT NULL,
  [FilledFte] DECIMAL(18,2) NOT NULL,
  [OpenDemandFte] DECIMAL(18,2) NOT NULL,
  [PayrollRunRateNgn] DECIMAL(19,2) NOT NULL,
  [HealthStatus] NVARCHAR(40) NOT NULL,
  [PlanningPriority] NVARCHAR(40) NOT NULL,
  [PlanJson] NVARCHAR(MAX) NOT NULL,
  [LastSyncedAt] DATETIME2 NOT NULL CONSTRAINT [DF_OrganizationWorkforcePlans_LastSyncedAt] DEFAULT SYSUTCDATETIME()
);
IF OBJECT_ID(N'[hris].[OrganizationWorkforceRequests]', N'U') IS NULL
CREATE TABLE [hris].[OrganizationWorkforceRequests] (
  [Id] NVARCHAR(80) NOT NULL CONSTRAINT [PK_OrganizationWorkforceRequests] PRIMARY KEY,
  [PlanId] NVARCHAR(220) NOT NULL,
  [BusinessUnit] NVARCHAR(180) NOT NULL,
  [Department] NVARCHAR(180) NOT NULL,
  [Location] NVARCHAR(180) NOT NULL,
  [RequestType] NVARCHAR(40) NOT NULL,
  [RequestedFte] DECIMAL(18,2) NOT NULL,
  [TargetQuarter] NVARCHAR(40) NOT NULL,
  [RequestedBy] NVARCHAR(160) NOT NULL,
  [Justification] NVARCHAR(MAX) NOT NULL,
  [ImpactSummary] NVARCHAR(MAX) NOT NULL,
  [ProjectedApprovedFte] DECIMAL(18,2) NOT NULL,
  [ProjectedFilledFte] DECIMAL(18,2) NOT NULL,
  [ProjectedGapFte] DECIMAL(18,2) NOT NULL,
  [IncrementalBudgetNgn] DECIMAL(19,2) NOT NULL,
  [RequestStatus] NVARCHAR(40) NOT NULL,
  [CreatedAt] DATETIME2 NOT NULL CONSTRAINT [DF_OrganizationWorkforceRequests_CreatedAt] DEFAULT SYSUTCDATETIME(),
  [UpdatedAt] DATETIME2 NULL
);`);
    dbReady.value = true;
  }
  return pool;
};

const persistPlans = async (plans: WorkforcePlanRecord[]) => {
  const pool = await ensureDb();
  await pool.request().query('DELETE FROM [hris].[OrganizationWorkforcePlans];');

  for (const plan of plans) {
    await pool.request()
      .input('Id', sql.NVarChar(220), plan.id)
      .input('SourceSystem', sql.NVarChar(80), SOURCE_SYSTEM)
      .input('BusinessUnit', sql.NVarChar(180), plan.businessUnit)
      .input('Department', sql.NVarChar(180), plan.department)
      .input('Location', sql.NVarChar(180), plan.location)
      .input('CostCenter', sql.NVarChar(180), plan.costCenter)
      .input('EmployeeCount', sql.Int, plan.approvedPositions)
      .input('ApprovedFte', sql.Decimal(18, 2), plan.approvedFte)
      .input('FilledFte', sql.Decimal(18, 2), plan.filledFte)
      .input('OpenDemandFte', sql.Decimal(18, 2), plan.openDemandFte)
      .input('PayrollRunRateNgn', sql.Decimal(19, 2), plan.payrollRunRateNgn)
      .input('HealthStatus', sql.NVarChar(40), plan.healthStatus)
      .input('PlanningPriority', sql.NVarChar(40), plan.planningPriority)
      .input('PlanJson', sql.NVarChar(sql.MAX), JSON.stringify(plan))
      .query(`
INSERT INTO [hris].[OrganizationWorkforcePlans]
  ([Id], [SourceSystem], [BusinessUnit], [Department], [Location], [CostCenter], [EmployeeCount], [ApprovedFte], [FilledFte], [OpenDemandFte], [PayrollRunRateNgn], [HealthStatus], [PlanningPriority], [PlanJson])
VALUES
  (@Id, @SourceSystem, @BusinessUnit, @Department, @Location, @CostCenter, @EmployeeCount, @ApprovedFte, @FilledFte, @OpenDemandFte, @PayrollRunRateNgn, @HealthStatus, @PlanningPriority, @PlanJson);`);
  }
};

const readPersistedPlans = async () => {
  const pool = await ensureDb();
  const result = await pool.request().query<DbPlanRow>(`
SELECT [Id], [PlanJson]
FROM [hris].[OrganizationWorkforcePlans]
ORDER BY [PlanningPriority], [OpenDemandFte] DESC, [Department], [Location];`);
  return result.recordset.map(rowToPlan);
};

const buildInsights = (plans: WorkforcePlanRecord[]): StructureInsight[] => {
  const highestReview = [...plans].sort((a, b) => b.reviewFte - a.reviewFte)[0];
  const weakestCoverage = [...plans].sort((a, b) => a.successionCoveragePct - b.successionCoveragePct)[0];
  const highestCost = [...plans].sort((a, b) => b.payrollRunRateNgn - a.payrollRunRateNgn)[0];

  return [
    {
      id: 'wfp-ins-review',
      severity: highestReview && highestReview.reviewFte >= 5 ? 'high' : highestReview && highestReview.reviewFte > 0 ? 'medium' : 'low',
      title: `${highestReview?.department || 'Workforce'} has the highest planning review exposure`,
      recommendation: 'Resolve missing manager, payroll, title, grade, and location data before using the segment for approved headcount decisions.',
    },
    {
      id: 'wfp-ins-coverage',
      severity: weakestCoverage && weakestCoverage.successionCoveragePct < 70 ? 'high' : 'medium',
      title: `${weakestCoverage?.department || 'A segment'} has the weakest manager/succession coverage`,
      recommendation: 'Assign reporting ownership and confirm emergency cover for employees without clear management coverage.',
    },
    {
      id: 'wfp-ins-cost',
      severity: 'medium',
      title: `${highestCost?.department || 'A segment'} carries the highest monthly payroll run rate`,
      recommendation: 'Use this segment for cost scenario modelling, workforce mix analysis, and approval threshold planning.',
    },
  ];
};

export const refreshWorkforcePlanningFromHris = async (): Promise<WorkforcePlanningData> => {
  const source = await readPayrollEmployees();
  const plans = buildPlansFromEmployees(source.employees);
  await persistPlans(plans);
  return buildPlanningPayload(plans, source);
};

export const readWorkforcePlanningData = async (): Promise<WorkforcePlanningData> => {
  const source = await readPayrollEmployees();
  const plans = buildPlansFromEmployees(source.employees);
  await persistPlans(plans);
  return buildPlanningPayload(await readPersistedPlans(), source);
};

const buildPlanningPayload = (plans: WorkforcePlanRecord[], source: Awaited<ReturnType<typeof readPayrollEmployees>>): WorkforcePlanningData => {
  const totalApprovedFte = round1(plans.reduce((sum, plan) => sum + plan.approvedFte, 0));
  const totalFilledFte = round1(plans.reduce((sum, plan) => sum + plan.filledFte, 0));
  const totalOpenDemandFte = round1(plans.reduce((sum, plan) => sum + plan.openDemandFte, 0));
  const openBudgetNgn = roundMoney(plans.reduce((sum, plan) => sum + plan.openBudgetNgn, 0));
  const payrollRunRateNgn = roundMoney(plans.reduce((sum, plan) => sum + plan.payrollRunRateNgn, 0));

  return {
    generatedAt: new Date().toISOString(),
    dataSource: {
      ...payrollDataSourceInfo(source),
      planningSource: source.databaseAvailable ? SOURCE_SYSTEM : source.source,
      migratedPlanCount: plans.length,
      migrationWarning: source.warning,
      independence: 'Workforce planning snapshots and requests are stored in the DLE HRIS database after migration and do not depend on live Sage reads for normal page rendering.',
    },
    summary: {
      totalPlans: plans.length,
      totalApprovedFte,
      totalFilledFte,
      totalOpenDemandFte,
      vacancyRatePct: totalApprovedFte ? round1((totalOpenDemandFte / totalApprovedFte) * 100) : 0,
      criticalGapRoles: plans.reduce((sum, plan) => sum + plan.criticalGapRoles, 0),
      immediateBackfills: plans.reduce((sum, plan) => sum + plan.immediateBackfills, 0),
      openBudgetNgn,
      avgSuccessionCoverage: average(plans.map((plan) => plan.successionCoveragePct)),
      avgAttritionRisk: average(plans.map((plan) => plan.attritionRiskPct)),
      payrollRunRateNgn,
      reviewFte: plans.reduce((sum, plan) => sum + plan.reviewFte, 0),
    },
    filterOptions: {
      businessUnits: uniqueSorted(plans.map((plan) => plan.businessUnit)),
      departments: uniqueSorted(plans.map((plan) => plan.department)),
      locations: uniqueSorted(plans.map((plan) => plan.location)),
      costCenters: uniqueSorted(plans.map((plan) => plan.costCenter)),
      planningPriorities: ['Immediate', 'Planned', 'Monitor'],
      healthStatuses: ['Healthy', 'Needs Attention', 'Critical'],
    },
    plans,
    insights: buildInsights(plans),
  };
};

export const readWorkforcePlanningRequests = async (): Promise<WorkforcePlanningRequestRecord[]> => {
  const pool = await ensureDb();
  const result = await pool.request().query<DbRequestRow>(`
SELECT *
FROM [hris].[OrganizationWorkforceRequests]
ORDER BY [CreatedAt] DESC;`);
  return result.recordset.map(rowToRequest);
};

export const writeWorkforcePlanningRequests = async (requests: WorkforcePlanningRequestRecord[]) => {
  const pool = await ensureDb();
  await pool.request().query('DELETE FROM [hris].[OrganizationWorkforceRequests];');
  for (const request of requests) {
    await pool.request()
      .input('Id', sql.NVarChar(80), request.id)
      .input('PlanId', sql.NVarChar(220), request.planId)
      .input('BusinessUnit', sql.NVarChar(180), request.businessUnit)
      .input('Department', sql.NVarChar(180), request.department)
      .input('Location', sql.NVarChar(180), request.location)
      .input('RequestType', sql.NVarChar(40), request.requestType)
      .input('RequestedFte', sql.Decimal(18, 2), request.requestedFte)
      .input('TargetQuarter', sql.NVarChar(40), request.targetQuarter)
      .input('RequestedBy', sql.NVarChar(160), request.requestedBy)
      .input('Justification', sql.NVarChar(sql.MAX), request.justification)
      .input('ImpactSummary', sql.NVarChar(sql.MAX), request.impactSummary)
      .input('ProjectedApprovedFte', sql.Decimal(18, 2), request.projectedApprovedFte)
      .input('ProjectedFilledFte', sql.Decimal(18, 2), request.projectedFilledFte)
      .input('ProjectedGapFte', sql.Decimal(18, 2), request.projectedGapFte)
      .input('IncrementalBudgetNgn', sql.Decimal(19, 2), request.incrementalBudgetNgn)
      .input('RequestStatus', sql.NVarChar(40), request.status)
      .input('CreatedAt', sql.DateTime2, new Date(request.createdAt))
      .input('UpdatedAt', sql.DateTime2, request.updatedAt ? new Date(request.updatedAt) : null)
      .query(`
INSERT INTO [hris].[OrganizationWorkforceRequests]
  ([Id], [PlanId], [BusinessUnit], [Department], [Location], [RequestType], [RequestedFte], [TargetQuarter], [RequestedBy], [Justification], [ImpactSummary], [ProjectedApprovedFte], [ProjectedFilledFte], [ProjectedGapFte], [IncrementalBudgetNgn], [RequestStatus], [CreatedAt], [UpdatedAt])
VALUES
  (@Id, @PlanId, @BusinessUnit, @Department, @Location, @RequestType, @RequestedFte, @TargetQuarter, @RequestedBy, @Justification, @ImpactSummary, @ProjectedApprovedFte, @ProjectedFilledFte, @ProjectedGapFte, @IncrementalBudgetNgn, @RequestStatus, @CreatedAt, @UpdatedAt);`);
  }
};
