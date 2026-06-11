import sql from 'mssql';
import { getDleEnterpriseDbPool } from '@/lib/dle-enterprise-db';
import type { DepartmentRecord, HealthStatus, NodeKind, StructureInsight } from '@/lib/organization-data';
import { readActiveSagePayrollEmployeeKeys, type SagePayrollEmployee } from '@/lib/sage-people-payroll-store';

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

const dbReady = { value: false };

const clean = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
const round1 = (value: number) => Math.round(value * 10) / 10;
const currency = (value: unknown) => {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
};
const slug = (value: string) =>
  value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'unassigned';

const mostCommon = (values: Array<string | null | undefined>, fallback: string) => {
  const counts = new Map<string, number>();
  for (const value of values.map(clean).filter(Boolean)) {
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] || fallback;
};

const uniqueSorted = (values: string[]) => Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b));

const isTerminated = (employee: SagePayrollEmployee) => {
  const status = `${clean(employee.statusName)} ${clean(employee.statusCode)}`.toLowerCase();
  return Boolean(employee.terminationDate) || status.includes('terminated') || status.includes('resigned') || status.includes('inactive');
};

const isSecurityRole = (employee: SagePayrollEmployee) => {
  const text = [employee.jobTitle, employee.jobTitleCode, employee.displayName, employee.managerName]
    .map(clean)
    .join(' ')
    .toLowerCase();
  return text.includes('security') || text.includes('community liaison');
};

const baseDepartmentName = (employee: SagePayrollEmployee) =>
  clean(employee.departmentName) || clean(employee.hierarchyDepartmentName);

const baseDepartmentCode = (employee: SagePayrollEmployee, name: string) =>
  clean(employee.departmentCode) || clean(employee.hierarchyDepartmentCode) || name.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);

const departmentName = (employee: SagePayrollEmployee) => {
  if (isSecurityRole(employee)) return 'SECURITY';
  return baseDepartmentName(employee) || 'Unassigned Department';
};

const departmentCode = (employee: SagePayrollEmployee, name: string) => {
  if (isSecurityRole(employee)) return 'SECURITY';
  return baseDepartmentCode(employee, name);
};

const employeeLocation = (employee: SagePayrollEmployee) =>
  clean(employee.hierarchyLocationName) || clean(employee.siteName) || 'Unassigned Location';

const employeeStatus = (employee: SagePayrollEmployee) => clean(employee.statusName) || clean(employee.statusCode) || 'Active';

const healthFrom = (headcount: number, missingManagerCount: number, locationCount: number): HealthStatus => {
  if (!headcount || missingManagerCount / Math.max(headcount, 1) >= 0.35) return 'Critical';
  if (missingManagerCount > 0 || locationCount > 3) return 'Needs Attention';
  return 'Healthy';
};

const ensureDb = async () => {
  const pool = await getDleEnterpriseDbPool();
  if (!pool) throw new Error('DLE Enterprise database is not configured. Organization departments must be stored in the database.');

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
  [BudgetUsd] DECIMAL(19,2) NOT NULL CONSTRAINT [DF_OrganizationDepartments_BudgetUsd] DEFAULT 0,
  [PayrollUsd] DECIMAL(19,2) NOT NULL CONSTRAINT [DF_OrganizationDepartments_PayrollUsd] DEFAULT 0,
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
);`);
    dbReady.value = true;
  }

  return pool;
};

const buildDepartmentsFromSage = (employees: SagePayrollEmployee[]): DepartmentRecord[] => {
  const reportDepartmentsByManagerCode = new Map<string, Array<{ name: string; code: string }>>();
  for (const employee of employees) {
    const managerCode = clean(employee.managerEmployeeCode) || clean(employee.managerName).split(' ')[0];
    const name = departmentName(employee);
    if (!managerCode || name === 'Unassigned Department') continue;
    const code = departmentCode(employee, name);
    const key = managerCode.replace(/_/g, '').toLowerCase();
    const current = reportDepartmentsByManagerCode.get(key) || [];
    current.push({ name, code });
    reportDepartmentsByManagerCode.set(key, current);
  }

  const groups = new Map<string, { code: string; name: string; rows: SagePayrollEmployee[] }>();

  for (const employee of employees) {
    let name = departmentName(employee);
    let inferredCode: string | null = null;
    if (name === 'Unassigned Department') {
      const normalizedCode = clean(employee.employeeCode).replace(/_/g, '').toLowerCase();
      const inferred = mostCommon((reportDepartmentsByManagerCode.get(normalizedCode) || []).map((item) => `${item.code}|||${item.name}`), '');
      if (inferred) name = inferred;
      else if (isTerminated(employee)) continue;
      else continue;
      const [codePart, namePart] = inferred.split('|||');
      inferredCode = codePart || null;
      name = namePart || name;
    }
    const code = inferredCode || departmentCode(employee, name);
    const key = code.toLowerCase();
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
      const leader = mostCommon(rows.map((employee) => employee.managerName), 'Unassigned Department Leader');
      const parentName = mostCommon(rows.map((employee) => employee.companyName), 'Dorman Long Engineering');
      const payrollUsd = rows.reduce((sum, employee) => sum + currency(employee.annualSalary), 0);
      const budgetUsd = payrollUsd;
      const spanOfControl = managers.length ? round1(headcount / managers.length) : headcount;
      const successionCoveragePct = Math.max(0, round1(((headcount - missingManagerCount) / Math.max(headcount, 1)) * 100));
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
        id: `dept-${slug(group.code)}`,
        parentId: null,
        name: group.name,
        code: group.code,
        kind: 'Department',
        leader,
        location: mostCommon(rows.map(employeeLocation), 'Unassigned Location'),
        headcount,
        openRoles: 0,
        budgetUsd,
        payrollUsd,
        spanOfControl,
        successionCoveragePct,
        attritionRiskPct,
        healthStatus,
        costCenter: group.code,
        description: `Sage Payroll department ${group.name} with ${headcount} active employee${headcount === 1 ? '' : 's'} across ${locations.length || 1} location${locations.length === 1 ? '' : 's'}.`,
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

const persistDepartments = async (departments: DepartmentRecord[]) => {
  const pool = await ensureDb();
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    const activeSourceCodes = new Set(departments.map((department) => department.code));
    const existing = await new sql.Request(tx).query(`SELECT [SourceCode] FROM [hris].[OrganizationDepartments] WHERE [SourceSystem]=N'Sage Payroll'`);
    for (const row of existing.recordset) {
      if (activeSourceCodes.has(row.SourceCode)) continue;
      await new sql.Request(tx)
        .input('SourceCode', sql.NVarChar(80), row.SourceCode)
        .query(`DELETE FROM [hris].[OrganizationDepartments] WHERE [SourceSystem]=N'Sage Payroll' AND [SourceCode]=@SourceCode`);
    }

    for (const department of departments) {
      await new sql.Request(tx)
        .input('Id', sql.NVarChar(120), department.id)
        .input('SourceSystem', sql.NVarChar(80), 'Sage Payroll')
        .input('SourceCode', sql.NVarChar(80), department.code)
        .input('Name', sql.NVarChar(180), department.name)
        .input('ParentName', sql.NVarChar(180), department.parentName)
        .input('ParentKind', sql.NVarChar(40), department.parentKind)
        .input('Location', sql.NVarChar(180), department.location)
        .input('Leader', sql.NVarChar(220), department.leader)
        .input('Headcount', sql.Int, department.headcount)
        .input('OpenRoles', sql.Int, department.openRoles)
        .input('BudgetUsd', sql.Decimal(19, 2), department.budgetUsd)
        .input('PayrollUsd', sql.Decimal(19, 2), department.payrollUsd)
        .input('SpanOfControl', sql.Decimal(9, 2), department.spanOfControl)
        .input('SuccessionCoveragePct', sql.Decimal(9, 2), department.successionCoveragePct)
        .input('AttritionRiskPct', sql.Decimal(9, 2), department.attritionRiskPct)
        .input('HealthStatus', sql.NVarChar(40), department.healthStatus)
        .input('CostCenter', sql.NVarChar(100), department.costCenter)
        .input('Description', sql.NVarChar(500), department.description)
        .input('TeamCount', sql.Int, department.teamCount)
        .input('TeamHeadcount', sql.Int, department.teamHeadcount)
        .input('TeamsJson', sql.NVarChar(sql.MAX), JSON.stringify(department.teams))
        .input('SourceSnapshotJson', sql.NVarChar(sql.MAX), JSON.stringify({ parentChain: department.parentChain, migratedAt: new Date().toISOString() }))
        .query(`
MERGE [hris].[OrganizationDepartments] AS target
USING (SELECT @SourceSystem AS [SourceSystem], @SourceCode AS [SourceCode]) AS source
ON target.[SourceSystem] = source.[SourceSystem] AND target.[SourceCode] = source.[SourceCode]
WHEN MATCHED THEN UPDATE SET
  [Id]=@Id,[Name]=@Name,[ParentName]=@ParentName,[ParentKind]=@ParentKind,[Location]=@Location,[Leader]=@Leader,
  [Headcount]=@Headcount,[OpenRoles]=@OpenRoles,[BudgetUsd]=@BudgetUsd,[PayrollUsd]=@PayrollUsd,[SpanOfControl]=@SpanOfControl,
  [SuccessionCoveragePct]=@SuccessionCoveragePct,[AttritionRiskPct]=@AttritionRiskPct,[HealthStatus]=@HealthStatus,[CostCenter]=@CostCenter,
  [Description]=@Description,[TeamCount]=@TeamCount,[TeamHeadcount]=@TeamHeadcount,[TeamsJson]=@TeamsJson,[SourceSnapshotJson]=@SourceSnapshotJson,
  [LastSyncedAt]=SYSUTCDATETIME()
WHEN NOT MATCHED THEN INSERT
  ([Id],[SourceSystem],[SourceCode],[Name],[ParentName],[ParentKind],[Location],[Leader],[Headcount],[OpenRoles],[BudgetUsd],[PayrollUsd],[SpanOfControl],[SuccessionCoveragePct],[AttritionRiskPct],[HealthStatus],[CostCenter],[Description],[TeamCount],[TeamHeadcount],[TeamsJson],[SourceSnapshotJson])
VALUES
  (@Id,@SourceSystem,@SourceCode,@Name,@ParentName,@ParentKind,@Location,@Leader,@Headcount,@OpenRoles,@BudgetUsd,@PayrollUsd,@SpanOfControl,@SuccessionCoveragePct,@AttritionRiskPct,@HealthStatus,@CostCenter,@Description,@TeamCount,@TeamHeadcount,@TeamsJson,@SourceSnapshotJson);`);
    }
    await tx.commit();
  } catch (error) {
    await tx.rollback();
    throw error;
  }
};

const readPersistedDepartments = async (): Promise<DepartmentRecord[]> => {
  const pool = await ensureDb();
  const result = await pool.request().query(`SELECT * FROM [hris].[OrganizationDepartments] WHERE [SourceSystem]=N'Sage Payroll' ORDER BY [Name]`);
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
      budgetUsd: Number(row.BudgetUsd || 0),
      payrollUsd: Number(row.PayrollUsd || 0),
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

const buildPayload = (departments: DepartmentRecord[]): DepartmentPayload => {
  const totalHeadcount = departments.reduce((sum, department) => sum + department.headcount, 0);
  const totalOpenRoles = departments.reduce((sum, department) => sum + department.openRoles, 0);
  const totalTeams = departments.reduce((sum, department) => sum + department.teamCount, 0);
  const avgSuccessionCoverage = departments.length
    ? round1(departments.reduce((sum, department) => sum + department.successionCoveragePct, 0) / departments.length)
    : 0;
  const avgAttritionRisk = departments.length
    ? round1(departments.reduce((sum, department) => sum + department.attritionRiskPct, 0) / departments.length)
    : 0;
  const criticalDepartments = departments.filter((department) => department.healthStatus === 'Critical').length;
  const needsAttentionDepartments = departments.filter((department) => department.healthStatus === 'Needs Attention').length;
  const highestAttrition = [...departments].sort((a, b) => b.attritionRiskPct - a.attritionRiskPct)[0];
  const weakestCoverage = [...departments].sort((a, b) => a.successionCoveragePct - b.successionCoveragePct)[0];
  const largestDepartment = [...departments].sort((a, b) => b.headcount - a.headcount)[0];

  return {
    generatedAt: new Date().toISOString(),
    permissions: {
      canEdit: true,
      canExport: true,
      canViewCosts: true,
    },
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
    insights: [
      {
        id: 'dept-ins-1',
        severity: highestAttrition && highestAttrition.attritionRiskPct >= 35 ? 'high' : highestAttrition && highestAttrition.attritionRiskPct > 0 ? 'medium' : 'low',
        title: `${highestAttrition?.name || 'Department'} has the highest manager assignment gap`,
        recommendation: 'Review Sage manager assignments and department leadership ownership for affected employees.',
      },
      {
        id: 'dept-ins-2',
        severity: weakestCoverage && weakestCoverage.successionCoveragePct <= 65 ? 'high' : 'medium',
        title: `${weakestCoverage?.name || 'Department'} has the weakest structure coverage`,
        recommendation: 'Improve department reporting completeness in Sage Payroll before downstream HRIS workflows depend on it.',
      },
      {
        id: 'dept-ins-3',
        severity: 'low',
        title: `${largestDepartment?.name || 'Department'} has the largest active workforce`,
        recommendation: 'Use this view to validate Sage department coding, location spread, and supervisory accountability.',
      },
    ],
  };
};

export async function syncSageDepartmentsToOrganizationDb(): Promise<DepartmentPayload> {
  await ensureDb();
  const { employees } = await readActiveSagePayrollEmployeeKeys();
  const departments = buildDepartmentsFromSage(employees);
  await persistDepartments(departments);
  return buildPayload(await readPersistedDepartments());
}
