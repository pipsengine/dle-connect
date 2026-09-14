import sql from 'mssql';
import { getDleEnterpriseDbPool } from '@/lib/dle-enterprise-db';
import type { DepartmentRecord, HealthStatus, NodeKind, StructureInsight } from '@/lib/organization-data';

type DepartmentPayload = {
  generatedAt: string;
  permissions: {
    canEdit: boolean;
    canExport: boolean;
    canViewCosts: boolean;
  };
  summary: {
    totalDepartments: number;
    totalHeadcount: number;
    totalOpenRoles: number;
    totalTeams: number;
    avgSuccessionCoverage: number;
    avgAttritionRisk: number;
    criticalDepartments: number;
    needsAttentionDepartments: number;
  };
  filterOptions: {
    locations: string[];
    healthStatuses: HealthStatus[];
    parentUnits: string[];
  };
  departments: DepartmentRecord[];
  insights: StructureInsight[];
};

type DepartmentTeam = DepartmentRecord['teams'][number];
type SystemEmployeeDepartmentRow = {
  employeeCode: string;
  fullName: string;
  employmentStatus: string;
  department: string;
  division: string;
  businessUnit: string;
  costCenter: string;
  managerName: string;
  functionalManager: string;
  departmentHead: string;
  workLocation: string;
  officeLocation: string;
  projectSite: string;
  annualSalary: number;
};

const dbReady = { value: false };
const SOURCE_SYSTEM = 'DLE Enterprise HRIS';

const clean = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
const cleanMax = (value: unknown, max: number) => clean(value).slice(0, max);
const round1 = (value: number) => Math.round(value * 10) / 10;
const slug = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'unassigned';
const uniqueSorted = (values: string[]) => Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b));
const validHealth = (value: unknown): HealthStatus => {
  const v = clean(value);
  return v === 'Critical' || v === 'Needs Attention' || v === 'Healthy' ? v : 'Healthy';
};
const numberValue = (value: unknown, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const mostCommon = (values: Array<string | null | undefined>, fallback: string) => {
  const counts = new Map<string, number>();
  for (const value of values.map(clean).filter(Boolean)) counts.set(value, (counts.get(value) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] || fallback;
};

const ensureDb = async () => {
  const pool = await getDleEnterpriseDbPool();
  if (!pool) throw new Error('DLE Enterprise database is not configured. Organization departments must be stored in the system database.');

  if (!dbReady.value) {
    await pool.request().query(`
IF SCHEMA_ID(N'hris') IS NULL EXEC(N'CREATE SCHEMA [hris]');
IF OBJECT_ID(N'[hris].[OrganizationDepartments]', N'U') IS NULL
CREATE TABLE [hris].[OrganizationDepartments] (
  [Id] NVARCHAR(120) NOT NULL CONSTRAINT [PK_OrganizationDepartments] PRIMARY KEY,
  [SourceSystem] NVARCHAR(80) NOT NULL,
  [SourceCode] NVARCHAR(80) NOT NULL,
  [Name] NVARCHAR(180) NOT NULL,
  [ParentName] NVARCHAR(180) NULL,
  [ParentKind] NVARCHAR(40) NULL,
  [Location] NVARCHAR(180) NOT NULL,
  [Leader] NVARCHAR(220) NOT NULL,
  [Headcount] INT NOT NULL CONSTRAINT [DF_OrganizationDepartments_Headcount] DEFAULT 0,
  [OpenRoles] INT NOT NULL CONSTRAINT [DF_OrganizationDepartments_OpenRoles] DEFAULT 0,
  [budgetNgn] DECIMAL(19,2) NOT NULL CONSTRAINT [DF_OrganizationDepartments_budgetNgn] DEFAULT 0,
  [payrollNgn] DECIMAL(19,2) NOT NULL CONSTRAINT [DF_OrganizationDepartments_payrollNgn] DEFAULT 0,
  [SpanOfControl] DECIMAL(9,2) NOT NULL CONSTRAINT [DF_OrganizationDepartments_SpanOfControl] DEFAULT 0,
  [SuccessionCoveragePct] DECIMAL(9,2) NOT NULL CONSTRAINT [DF_OrganizationDepartments_SuccessionCoveragePct] DEFAULT 0,
  [AttritionRiskPct] DECIMAL(9,2) NOT NULL CONSTRAINT [DF_OrganizationDepartments_AttritionRiskPct] DEFAULT 0,
  [HealthStatus] NVARCHAR(40) NOT NULL,
  [CostCenter] NVARCHAR(100) NOT NULL,
  [Description] NVARCHAR(500) NOT NULL,
  [TeamCount] INT NOT NULL CONSTRAINT [DF_OrganizationDepartments_TeamCount] DEFAULT 0,
  [TeamHeadcount] INT NOT NULL CONSTRAINT [DF_OrganizationDepartments_TeamHeadcount] DEFAULT 0,
  [TeamsJson] NVARCHAR(MAX) NOT NULL,
  [SourceSnapshotJson] NVARCHAR(MAX) NOT NULL,
  [LastSyncedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_OrganizationDepartments_LastSyncedAt] DEFAULT SYSUTCDATETIME(),
  CONSTRAINT [UQ_OrganizationDepartments_Source] UNIQUE ([SourceSystem], [SourceCode]),
  CONSTRAINT [CK_OrganizationDepartments_TeamsJson] CHECK (ISJSON([TeamsJson]) = 1),
  CONSTRAINT [CK_OrganizationDepartments_SourceSnapshotJson] CHECK (ISJSON([SourceSnapshotJson]) = 1)
);
IF COL_LENGTH(N'hris.OrganizationDepartments', N'budgetNgn') IS NULL AND COL_LENGTH(N'hris.OrganizationDepartments', N'BudgetUsd') IS NOT NULL
  EXEC sp_rename N'hris.OrganizationDepartments.BudgetUsd', N'budgetNgn', N'COLUMN';
IF COL_LENGTH(N'hris.OrganizationDepartments', N'payrollNgn') IS NULL AND COL_LENGTH(N'hris.OrganizationDepartments', N'PayrollUsd') IS NOT NULL
  EXEC sp_rename N'hris.OrganizationDepartments.PayrollUsd', N'payrollNgn', N'COLUMN';
IF COL_LENGTH(N'hris.OrganizationDepartments', N'budgetNgn') IS NULL
  ALTER TABLE [hris].[OrganizationDepartments] ADD [budgetNgn] DECIMAL(19,2) NOT NULL CONSTRAINT [DF_OrganizationDepartments_budgetNgn] DEFAULT 0;
IF COL_LENGTH(N'hris.OrganizationDepartments', N'payrollNgn') IS NULL
  ALTER TABLE [hris].[OrganizationDepartments] ADD [payrollNgn] DECIMAL(19,2) NOT NULL CONSTRAINT [DF_OrganizationDepartments_payrollNgn] DEFAULT 0;`);
    dbReady.value = true;
  }

  return pool;
};

const employeeDepartment = (employee: SystemEmployeeDepartmentRow) => clean(employee.department) || 'Unassigned Department';
const employeeDepartmentCode = (employee: SystemEmployeeDepartmentRow, name: string) =>
  clean(employee.costCenter) || name.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
const employeeLocation = (employee: SystemEmployeeDepartmentRow) => clean(employee.officeLocation) || clean(employee.workLocation) || 'Unassigned Location';
const isInactive = (employee: SystemEmployeeDepartmentRow) => {
  const status = clean(employee.employmentStatus).toLowerCase();
  return ['terminated', 'resigned', 'retired', 'inactive', 'exited'].some((item) => status.includes(item));
};
const healthFrom = (headcount: number, missingManagerCount: number, locationCount: number): HealthStatus => {
  if (!headcount || missingManagerCount / Math.max(headcount, 1) >= 0.35) return 'Critical';
  if (missingManagerCount > 0 || locationCount > 3) return 'Needs Attention';
  return 'Healthy';
};

const buildDepartmentsFromSystemEmployees = (employees: SystemEmployeeDepartmentRow[]): DepartmentRecord[] => {
  const groups = new Map<string, { code: string; name: string; rows: SystemEmployeeDepartmentRow[] }>();

  for (const employee of employees) {
    if (isInactive(employee)) continue;
    const name = employeeDepartment(employee);
    const code = employeeDepartmentCode(employee, name);
    const key = `${code}|||${name}`.toLowerCase();
    const group = groups.get(key) || { code, name, rows: [] };
    group.rows.push(employee);
    groups.set(key, group);
  }

  return [...groups.values()]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((group) => {
      const rows = group.rows;
      const headcount = rows.length;
      const locations = uniqueSorted(rows.map(employeeLocation));
      const managers = uniqueSorted(rows.map((employee) => clean(employee.managerName)).filter(Boolean));
      const missingManagerCount = rows.filter((employee) => !clean(employee.managerName)).length;
      const leader = mostCommon(rows.map((employee) => employee.departmentHead || employee.managerName), 'Unassigned Department Leader');
      const parentName = mostCommon(rows.map((employee) => employee.businessUnit), 'DLE Enterprise');
      const payrollNgn = rows.reduce((sum, employee) => sum + Number(employee.annualSalary || 0), 0);
      const spanOfControl = managers.length ? round1(headcount / managers.length) : headcount;
      const successionCoveragePct = round1(((headcount - missingManagerCount) / Math.max(headcount, 1)) * 100);
      const attritionRiskPct = round1((missingManagerCount / Math.max(headcount, 1)) * 100);
      const healthStatus = healthFrom(headcount, missingManagerCount, locations.length);
      const teams: DepartmentTeam[] = locations.map((location) => {
        const teamRows = rows.filter((employee) => employeeLocation(employee) === location);
        const teamMissingManagers = teamRows.filter((employee) => !clean(employee.managerName)).length;
        return {
          id: `team-${slug(group.code)}-${slug(location)}`,
          name: location,
          leader: mostCommon(teamRows.map((employee) => employee.managerName), 'Unassigned Team Leader'),
          headcount: teamRows.length,
          openRoles: 0,
          healthStatus: healthFrom(teamRows.length, teamMissingManagers, 1),
        };
      });

      return {
        id: `dept-${slug(group.code)}-${slug(group.name)}`,
        parentId: null,
        name: group.name,
        code: group.code,
        kind: 'Department',
        leader,
        location: mostCommon(rows.map(employeeLocation), 'Unassigned Location'),
        headcount,
        openRoles: 0,
        budgetNgn: payrollNgn,
        payrollNgn,
        spanOfControl,
        successionCoveragePct,
        attritionRiskPct,
        healthStatus,
        costCenter: group.code,
        description: `System department ${group.name} with ${headcount} active employee${headcount === 1 ? '' : 's'} across ${locations.length || 1} location${locations.length === 1 ? '' : 's'}.`,
        childCount: teams.length,
        descendantCount: teams.length,
        parentName,
        parentKind: 'Company',
        parentChain: [parentName],
        teamCount: teams.length,
        teamHeadcount: headcount,
        teams,
      } satisfies DepartmentRecord;
    });
};

const persistSystemDepartments = async (departments: DepartmentRecord[]) => {
  const pool = await ensureDb();
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    for (const department of departments) {
      await new sql.Request(tx)
        .input('Id', sql.NVarChar(120), department.id)
        .input('SourceSystem', sql.NVarChar(80), SOURCE_SYSTEM)
        .input('SourceCode', sql.NVarChar(80), department.code)
        .input('Name', sql.NVarChar(180), department.name)
        .input('ParentName', sql.NVarChar(180), department.parentName)
        .input('ParentKind', sql.NVarChar(40), department.parentKind)
        .input('Location', sql.NVarChar(180), department.location)
        .input('Leader', sql.NVarChar(220), department.leader)
        .input('Headcount', sql.Int, department.headcount)
        .input('OpenRoles', sql.Int, department.openRoles)
        .input('budgetNgn', sql.Decimal(19, 2), department.budgetNgn)
        .input('payrollNgn', sql.Decimal(19, 2), department.payrollNgn)
        .input('SpanOfControl', sql.Decimal(9, 2), department.spanOfControl)
        .input('SuccessionCoveragePct', sql.Decimal(9, 2), department.successionCoveragePct)
        .input('AttritionRiskPct', sql.Decimal(9, 2), department.attritionRiskPct)
        .input('HealthStatus', sql.NVarChar(40), department.healthStatus)
        .input('CostCenter', sql.NVarChar(100), department.costCenter)
        .input('Description', sql.NVarChar(500), department.description)
        .input('TeamCount', sql.Int, department.teamCount)
        .input('TeamHeadcount', sql.Int, department.teamHeadcount)
        .input('TeamsJson', sql.NVarChar(sql.MAX), JSON.stringify(department.teams))
        .input('SourceSnapshotJson', sql.NVarChar(sql.MAX), JSON.stringify({ parentChain: department.parentChain, generatedFrom: 'EmployeeMasterView', updatedAt: new Date().toISOString() }))
        .query(`
MERGE [hris].[OrganizationDepartments] AS target
USING (SELECT @SourceSystem AS [SourceSystem], @SourceCode AS [SourceCode]) AS source
ON target.[SourceSystem] = source.[SourceSystem] AND target.[SourceCode] = source.[SourceCode]
WHEN MATCHED THEN UPDATE SET
  [Id]=@Id,[Name]=@Name,[ParentName]=@ParentName,[ParentKind]=@ParentKind,[Location]=@Location,[Leader]=@Leader,
  [Headcount]=@Headcount,[OpenRoles]=@OpenRoles,[budgetNgn]=@budgetNgn,[payrollNgn]=@payrollNgn,[SpanOfControl]=@SpanOfControl,
  [SuccessionCoveragePct]=@SuccessionCoveragePct,[AttritionRiskPct]=@AttritionRiskPct,[HealthStatus]=@HealthStatus,[CostCenter]=@CostCenter,
  [Description]=@Description,[TeamCount]=@TeamCount,[TeamHeadcount]=@TeamHeadcount,[TeamsJson]=@TeamsJson,[SourceSnapshotJson]=@SourceSnapshotJson,
  [LastSyncedAt]=SYSUTCDATETIME()
WHEN NOT MATCHED THEN INSERT
  ([Id],[SourceSystem],[SourceCode],[Name],[ParentName],[ParentKind],[Location],[Leader],[Headcount],[OpenRoles],[budgetNgn],[payrollNgn],[SpanOfControl],[SuccessionCoveragePct],[AttritionRiskPct],[HealthStatus],[CostCenter],[Description],[TeamCount],[TeamHeadcount],[TeamsJson],[SourceSnapshotJson])
VALUES
  (@Id,@SourceSystem,@SourceCode,@Name,@ParentName,@ParentKind,@Location,@Leader,@Headcount,@OpenRoles,@budgetNgn,@payrollNgn,@SpanOfControl,@SuccessionCoveragePct,@AttritionRiskPct,@HealthStatus,@CostCenter,@Description,@TeamCount,@TeamHeadcount,@TeamsJson,@SourceSnapshotJson);`);
    }
    await tx.commit();
  } catch (error) {
    await tx.rollback().catch(() => undefined);
    throw error;
  }
};

const saveDepartment = async (department: DepartmentRecord) => {
  const pool = await ensureDb();
  await pool
    .request()
    .input('Id', sql.NVarChar(120), department.id)
    .input('SourceSystem', sql.NVarChar(80), SOURCE_SYSTEM)
    .input('SourceCode', sql.NVarChar(80), department.code)
    .input('Name', sql.NVarChar(180), department.name)
    .input('ParentName', sql.NVarChar(180), department.parentName)
    .input('ParentKind', sql.NVarChar(40), department.parentKind)
    .input('Location', sql.NVarChar(180), department.location)
    .input('Leader', sql.NVarChar(220), department.leader)
    .input('Headcount', sql.Int, department.headcount)
    .input('OpenRoles', sql.Int, department.openRoles)
    .input('budgetNgn', sql.Decimal(19, 2), department.budgetNgn)
    .input('payrollNgn', sql.Decimal(19, 2), department.payrollNgn)
    .input('SpanOfControl', sql.Decimal(9, 2), department.spanOfControl)
    .input('SuccessionCoveragePct', sql.Decimal(9, 2), department.successionCoveragePct)
    .input('AttritionRiskPct', sql.Decimal(9, 2), department.attritionRiskPct)
    .input('HealthStatus', sql.NVarChar(40), department.healthStatus)
    .input('CostCenter', sql.NVarChar(100), department.costCenter)
    .input('Description', sql.NVarChar(500), department.description)
    .input('TeamCount', sql.Int, department.teamCount)
    .input('TeamHeadcount', sql.Int, department.teamHeadcount)
    .input('TeamsJson', sql.NVarChar(sql.MAX), JSON.stringify(department.teams))
    .input('SourceSnapshotJson', sql.NVarChar(sql.MAX), JSON.stringify({ parentChain: department.parentChain, editedAt: new Date().toISOString() }))
    .query(`
MERGE [hris].[OrganizationDepartments] AS target
USING (SELECT @SourceSystem AS [SourceSystem], @SourceCode AS [SourceCode]) AS source
ON target.[SourceSystem] = source.[SourceSystem] AND target.[SourceCode] = source.[SourceCode]
WHEN MATCHED THEN UPDATE SET
  [Id]=@Id,[Name]=@Name,[ParentName]=@ParentName,[ParentKind]=@ParentKind,[Location]=@Location,[Leader]=@Leader,
  [OpenRoles]=@OpenRoles,[budgetNgn]=@budgetNgn,[payrollNgn]=@payrollNgn,[SpanOfControl]=@SpanOfControl,
  [SuccessionCoveragePct]=@SuccessionCoveragePct,[AttritionRiskPct]=@AttritionRiskPct,[HealthStatus]=@HealthStatus,[CostCenter]=@CostCenter,
  [Description]=@Description,[TeamCount]=@TeamCount,[TeamHeadcount]=@TeamHeadcount,[TeamsJson]=@TeamsJson,[SourceSnapshotJson]=@SourceSnapshotJson,
  [LastSyncedAt]=SYSUTCDATETIME()
WHEN NOT MATCHED THEN INSERT
  ([Id],[SourceSystem],[SourceCode],[Name],[ParentName],[ParentKind],[Location],[Leader],[Headcount],[OpenRoles],[budgetNgn],[payrollNgn],[SpanOfControl],[SuccessionCoveragePct],[AttritionRiskPct],[HealthStatus],[CostCenter],[Description],[TeamCount],[TeamHeadcount],[TeamsJson],[SourceSnapshotJson])
VALUES
  (@Id,@SourceSystem,@SourceCode,@Name,@ParentName,@ParentKind,@Location,@Leader,@Headcount,@OpenRoles,@budgetNgn,@payrollNgn,@SpanOfControl,@SuccessionCoveragePct,@AttritionRiskPct,@HealthStatus,@CostCenter,@Description,@TeamCount,@TeamHeadcount,@TeamsJson,@SourceSnapshotJson);`);
};

const readPersistedDepartments = async (): Promise<DepartmentRecord[]> => {
  const pool = await ensureDb();
  const result = await pool.request().input('SourceSystem', sql.NVarChar(80), SOURCE_SYSTEM).query(`
    SELECT *
    FROM [hris].[OrganizationDepartments]
    WHERE [SourceSystem]=@SourceSystem
    ORDER BY [Name];
  `);

  return result.recordset.map((row) => {
    const teams = JSON.parse(row.TeamsJson || '[]') as DepartmentTeam[];
    const snapshot = JSON.parse(row.SourceSnapshotJson || '{}') as { parentChain?: string[] };
    return {
      id: row.Id,
      parentId: null,
      name: row.Name,
      code: row.SourceCode,
      kind: 'Department',
      leader: row.Leader,
      location: row.Location,
      headcount: Number(row.Headcount || 0),
      openRoles: Number(row.OpenRoles || 0),
      budgetNgn: Number(row.budgetNgn || 0),
      payrollNgn: Number(row.payrollNgn || 0),
      spanOfControl: Number(row.SpanOfControl || 0),
      successionCoveragePct: Number(row.SuccessionCoveragePct || 0),
      attritionRiskPct: Number(row.AttritionRiskPct || 0),
      healthStatus: row.HealthStatus,
      costCenter: row.CostCenter,
      description: row.Description,
      childCount: teams.length,
      descendantCount: teams.length,
      parentName: row.ParentName,
      parentKind: (row.ParentKind || null) as NodeKind | null,
      parentChain: snapshot.parentChain || (row.ParentName ? [row.ParentName] : []),
      teamCount: Number(row.TeamCount || teams.length),
      teamHeadcount: Number(row.TeamHeadcount || 0),
      teams,
    } satisfies DepartmentRecord;
  });
};

const readSystemEmployeeDepartmentRows = async (): Promise<SystemEmployeeDepartmentRow[]> => {
  const pool = await ensureDb();
  const result = await pool.request().query(`
    SELECT
      e.employee_code,
      e.full_name,
      e.employment_status,
      j.department,
      j.division,
      j.business_unit,
      j.cost_center,
      j.reporting_manager,
      j.functional_manager,
      j.department_head,
      emp.work_location,
      j.office_location,
      j.project_site,
      pay.annual_salary
    FROM [hris].[Employees] e
    LEFT JOIN [hris].[EmployeeJobInfo] j ON j.employee_id = e.employee_id
    LEFT JOIN [hris].[EmployeeEmploymentInfo] emp ON emp.employee_id = e.employee_id
    LEFT JOIN [hris].[EmployeePayrollSetup] pay ON pay.employee_id = e.employee_id
    ORDER BY e.employee_code;
  `);

  return (result.recordset || []).map((row: any) => ({
    employeeCode: clean(row.employee_code),
    fullName: clean(row.full_name),
    employmentStatus: clean(row.employment_status),
    department: clean(row.department),
    division: clean(row.division),
    businessUnit: clean(row.business_unit),
    costCenter: clean(row.cost_center),
    managerName: clean(row.reporting_manager),
    functionalManager: clean(row.functional_manager),
    departmentHead: clean(row.department_head),
    workLocation: clean(row.work_location),
    officeLocation: clean(row.office_location),
    projectSite: clean(row.project_site),
    annualSalary: Number(row.annual_salary || 0),
  }));
};

const buildPayload = (departments: DepartmentRecord[]): DepartmentPayload => {
  const totalHeadcount = departments.reduce((sum, department) => sum + department.headcount, 0);
  const totalOpenRoles = departments.reduce((sum, department) => sum + department.openRoles, 0);
  const totalTeams = departments.reduce((sum, department) => sum + department.teamCount, 0);
  const avgSuccessionCoverage = departments.length ? round1(departments.reduce((sum, department) => sum + department.successionCoveragePct, 0) / departments.length) : 0;
  const avgAttritionRisk = departments.length ? round1(departments.reduce((sum, department) => sum + department.attritionRiskPct, 0) / departments.length) : 0;
  const criticalDepartments = departments.filter((department) => department.healthStatus === 'Critical').length;
  const needsAttentionDepartments = departments.filter((department) => department.healthStatus === 'Needs Attention').length;
  const highestAttrition = [...departments].sort((a, b) => b.attritionRiskPct - a.attritionRiskPct)[0];
  const weakestCoverage = [...departments].sort((a, b) => a.successionCoveragePct - b.successionCoveragePct)[0];
  const largestDepartment = [...departments].sort((a, b) => b.headcount - a.headcount)[0];

  return {
    generatedAt: new Date().toISOString(),
    permissions: { canEdit: true, canExport: true, canViewCosts: true },
    summary: {
      totalDepartments: departments.length,
      totalHeadcount,
      totalOpenRoles,
      totalTeams,
      avgSuccessionCoverage,
      avgAttritionRisk,
      criticalDepartments,
      needsAttentionDepartments,
    },
    filterOptions: {
      locations: uniqueSorted(departments.map((department) => department.location)),
      healthStatuses: ['Healthy', 'Needs Attention', 'Critical'],
      parentUnits: uniqueSorted(departments.map((department) => department.parentName || '').filter(Boolean)),
    },
    departments,
    insights: departments.length
      ? [
          {
            id: 'dept-ins-1',
            severity: highestAttrition && highestAttrition.attritionRiskPct >= 35 ? 'high' : highestAttrition && highestAttrition.attritionRiskPct > 0 ? 'medium' : 'low',
            title: `${highestAttrition?.name || 'Department'} has the highest manager assignment gap`,
            recommendation: 'Review reporting manager and department leader assignments in the system employee master.',
          },
          {
            id: 'dept-ins-2',
            severity: weakestCoverage && weakestCoverage.successionCoveragePct <= 65 ? 'high' : 'medium',
            title: `${weakestCoverage?.name || 'Department'} has the weakest structure coverage`,
            recommendation: 'Complete manager, department head, and business unit ownership in the system database.',
          },
          {
            id: 'dept-ins-3',
            severity: 'low',
            title: `${largestDepartment?.name || 'Department'} has the largest active workforce`,
            recommendation: 'Use this system view to validate department coding, location spread, and supervisory accountability.',
          },
        ]
      : [],
  };
};

export async function readSystemDepartmentsFromOrganizationDb(): Promise<DepartmentPayload> {
  await ensureDb();
  const persisted = await readPersistedDepartments();
  if (persisted.length) return buildPayload(persisted);

  const employees = await readSystemEmployeeDepartmentRows();
  const departments = buildDepartmentsFromSystemEmployees(employees);
  if (departments.length) {
    await persistSystemDepartments(departments);
    return buildPayload(await readPersistedDepartments());
  }
  return buildPayload([]);
}

export async function createDepartmentInOrganizationDb(input: Record<string, unknown>): Promise<DepartmentPayload> {
  const name = cleanMax(input.name, 180);
  const code = cleanMax(input.code, 80).toUpperCase();
  if (!name) throw new Error('Department name is required.');
  if (!code) throw new Error('Department code is required.');
  const existing = await readPersistedDepartments();
  if (existing.some((department) => department.code.toLowerCase() === code.toLowerCase())) throw new Error('Department code already exists.');

  const parentName = cleanMax(input.parentName, 180) || null;
  await saveDepartment({
    id: `dept-${slug(code)}-${slug(name)}`,
    parentId: null,
    name,
    code,
    kind: 'Department',
    leader: cleanMax(input.leader, 220) || 'Unassigned Department Leader',
    location: cleanMax(input.location, 180) || 'Unassigned Location',
    headcount: 0,
    openRoles: Math.max(0, Math.floor(numberValue(input.openRoles))),
    budgetNgn: Math.max(0, numberValue(input.budgetNgn)),
    payrollNgn: 0,
    spanOfControl: Math.max(0, numberValue(input.spanOfControl)),
    successionCoveragePct: Math.max(0, Math.min(100, numberValue(input.successionCoveragePct, 0))),
    attritionRiskPct: Math.max(0, Math.min(100, numberValue(input.attritionRiskPct, 0))),
    healthStatus: validHealth(input.healthStatus),
    costCenter: cleanMax(input.costCenter, 100) || code,
    description: cleanMax(input.description, 500) || `System department ${name}.`,
    childCount: 0,
    descendantCount: 0,
    parentName,
    parentKind: parentName ? 'Company' : null,
    parentChain: parentName ? [parentName] : [],
    teamCount: 0,
    teamHeadcount: 0,
    teams: [],
  });
  return readSystemDepartmentsFromOrganizationDb();
}

export async function updateDepartmentInOrganizationDb(id: string, input: Record<string, unknown>): Promise<DepartmentPayload> {
  const departments = await readPersistedDepartments();
  const current = departments.find((department) => department.id === id || department.code.toLowerCase() === id.toLowerCase());
  if (!current) throw new Error('Department not found.');
  const parentName = cleanMax(input.parentName, 180);
  const next: DepartmentRecord = {
    ...current,
    name: cleanMax(input.name, 180) || current.name,
    leader: cleanMax(input.leader, 220) || current.leader,
    location: cleanMax(input.location, 180) || current.location,
    openRoles: Math.max(0, Math.floor(numberValue(input.openRoles, current.openRoles))),
    budgetNgn: Math.max(0, numberValue(input.budgetNgn, current.budgetNgn)),
    spanOfControl: Math.max(0, numberValue(input.spanOfControl, current.spanOfControl)),
    successionCoveragePct: Math.max(0, Math.min(100, numberValue(input.successionCoveragePct, current.successionCoveragePct))),
    attritionRiskPct: Math.max(0, Math.min(100, numberValue(input.attritionRiskPct, current.attritionRiskPct))),
    healthStatus: validHealth(input.healthStatus || current.healthStatus),
    costCenter: cleanMax(input.costCenter, 100) || current.costCenter,
    description: cleanMax(input.description, 500) || current.description,
    parentName: parentName || null,
    parentKind: parentName ? 'Company' : null,
    parentChain: parentName ? [parentName] : [],
  };
  await saveDepartment(next);
  return readSystemDepartmentsFromOrganizationDb();
}

export async function deleteDepartmentFromOrganizationDb(id: string): Promise<DepartmentPayload> {
  const departments = await readPersistedDepartments();
  const current = departments.find((department) => department.id === id || department.code.toLowerCase() === id.toLowerCase());
  if (!current) throw new Error('Department not found.');
  if (current.headcount > 0) throw new Error('Departments with assigned employees cannot be deleted. Reassign employees first.');
  const pool = await ensureDb();
  await pool
    .request()
    .input('SourceSystem', sql.NVarChar(80), SOURCE_SYSTEM)
    .input('SourceCode', sql.NVarChar(80), current.code)
    .query(`DELETE FROM [hris].[OrganizationDepartments] WHERE [SourceSystem]=@SourceSystem AND [SourceCode]=@SourceCode`);
  return readSystemDepartmentsFromOrganizationDb();
}

export async function searchDepartmentHeadEmployees(query: string, limit = 20) {
  const pool = await ensureDb();
  const q = clean(query);
  const take = Math.max(1, Math.min(40, Math.floor(numberValue(limit, 20))));
  const request = pool.request().input('limit', sql.Int, take);
  const searchSql = q
    ? `AND (
      e.employee_code LIKE @q
      OR e.full_name LIKE @q
      OR ISNULL(j.job_title, N'') LIKE @q
      OR ISNULL(j.department, N'') LIKE @q
    )`
    : '';
  if (q) request.input('q', sql.NVarChar(180), `%${q}%`);
  const result = await request.query(`
SELECT TOP (@limit)
  e.employee_code,
  e.full_name,
  e.employment_status,
  ISNULL(j.job_title, N'') AS job_title,
  ISNULL(j.department, N'') AS department
FROM [hris].[Employees] e
LEFT JOIN [hris].[EmployeeJobInfo] j ON j.employee_id = e.employee_id
WHERE e.employment_status NOT LIKE N'%Inactive%'
  AND e.employment_status NOT LIKE N'%Terminated%'
  AND e.employment_status NOT LIKE N'%Resigned%'
  AND e.employment_status NOT LIKE N'%Retired%'
  AND e.employment_status NOT LIKE N'%Deceased%'
  ${searchSql}
ORDER BY e.full_name, e.employee_code;
`);
  return (result.recordset || []).map((row: any) => ({
    employeeCode: clean(row.employee_code),
    fullName: clean(row.full_name),
    jobTitle: clean(row.job_title),
    department: clean(row.department),
    status: clean(row.employment_status),
    label: `${clean(row.employee_code)} - ${clean(row.full_name)}`,
  })).filter((row: { employeeCode: string; fullName: string }) => row.employeeCode && row.fullName);
}

export async function refreshDepartmentsFromSystemEmployees(): Promise<DepartmentPayload> {
  const employees = await readSystemEmployeeDepartmentRows();
  const departments = buildDepartmentsFromSystemEmployees(employees);
  await persistSystemDepartments(departments);
  return readSystemDepartmentsFromOrganizationDb();
}
