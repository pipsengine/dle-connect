import sql from 'mssql';
import { getDleEnterpriseDbPool } from '@/lib/dle-enterprise-db';
import type { HealthStatus, LocationSiteRecord, StructureInsight } from '@/lib/organization-data';
import { readActiveSagePayrollEmployeeKeys, type SagePayrollEmployee } from '@/lib/sage-people-payroll-store';

type LocationPayload = {
  generatedAt: string;
  permissions: {
    canEdit: boolean;
    canExport: boolean;
    canViewCosts: boolean;
  };
  summary: {
    totalRecords: number;
    totalLocations: number;
    totalSites: number;
    totalHeadcount: number;
    totalOpenRoles: number;
    avgSuccessionCoverage: number;
    avgAttritionRisk: number;
  };
  filterOptions: {
    recordTypes: Array<'Location' | 'Site'>;
    regions: string[];
    siteCategories: string[];
    healthStatuses: HealthStatus[];
  };
  records: LocationSiteRecord[];
  insights: StructureInsight[];
};

type RelatedItem = LocationSiteRecord['relatedItems'][number];

const dbReady = { value: false };
const clean = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
const slug = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'unassigned';
const round1 = (value: number) => Math.round(value * 10) / 10;
const money = (value: unknown) => {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
};
const uniqueSorted = (values: string[]) => Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b));

const mostCommon = (values: string[], fallback: string) => {
  const counts = new Map<string, number>();
  for (const value of values.map(clean).filter(Boolean)) counts.set(value, (counts.get(value) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] || fallback;
};

const isTerminated = (employee: SagePayrollEmployee) => {
  const status = `${clean(employee.statusName)} ${clean(employee.statusCode)}`.toLowerCase();
  return Boolean(employee.terminationDate) || status.includes('terminated') || status.includes('resigned') || status.includes('inactive');
};

const isSecurityRole = (employee: SagePayrollEmployee) => {
  const text = [employee.jobTitle, employee.jobTitleCode, employee.displayName, employee.managerName].map(clean).join(' ').toLowerCase();
  return text.includes('security') || text.includes('community liaison');
};

const departmentName = (employee: SagePayrollEmployee) => {
  if (isSecurityRole(employee)) return 'SECURITY';
  return clean(employee.departmentName) || clean(employee.hierarchyDepartmentName) || 'Unassigned Department';
};

const siteCode = (employee: SagePayrollEmployee) =>
  clean(employee.siteCode) || clean(employee.hierarchyLocationCode) || clean(employee.siteName) || clean(employee.hierarchyLocationName);

const siteName = (employee: SagePayrollEmployee) =>
  clean(employee.siteName) || clean(employee.hierarchyLocationName);

const ensureDb = async () => {
  const pool = await getDleEnterpriseDbPool();
  if (!pool) throw new Error('DLE Enterprise database is not configured. Organization locations must be stored in the database.');

  if (!dbReady.value) {
    await pool.request().query(`
IF SCHEMA_ID(N'hris') IS NULL EXEC(N'CREATE SCHEMA [hris]');
IF OBJECT_ID(N'[hris].[OrganizationLocationsSites]', N'U') IS NULL
CREATE TABLE [hris].[OrganizationLocationsSites] (
  [Id] NVARCHAR(140) NOT NULL CONSTRAINT [PK_OrganizationLocationsSites] PRIMARY KEY,
  [SourceSystem] NVARCHAR(80) NOT NULL,
  [SourceCode] NVARCHAR(100) NOT NULL,
  [Name] NVARCHAR(180) NOT NULL,
  [RecordType] NVARCHAR(20) NOT NULL,
  [ParentName] NVARCHAR(180) NULL,
  [Region] NVARCHAR(180) NOT NULL,
  [Country] NVARCHAR(100) NOT NULL,
  [SiteCategory] NVARCHAR(60) NOT NULL,
  [Leader] NVARCHAR(220) NOT NULL,
  [Location] NVARCHAR(180) NOT NULL,
  [Headcount] INT NOT NULL CONSTRAINT [DF_OrganizationLocationsSites_Headcount] DEFAULT 0,
  [OpenRoles] INT NOT NULL CONSTRAINT [DF_OrganizationLocationsSites_OpenRoles] DEFAULT 0,
  [BudgetUsd] DECIMAL(19,2) NOT NULL CONSTRAINT [DF_OrganizationLocationsSites_BudgetUsd] DEFAULT 0,
  [PayrollUsd] DECIMAL(19,2) NOT NULL CONSTRAINT [DF_OrganizationLocationsSites_PayrollUsd] DEFAULT 0,
  [SpanOfControl] DECIMAL(9,2) NOT NULL CONSTRAINT [DF_OrganizationLocationsSites_SpanOfControl] DEFAULT 0,
  [SuccessionCoveragePct] DECIMAL(9,2) NOT NULL CONSTRAINT [DF_OrganizationLocationsSites_SuccessionCoveragePct] DEFAULT 0,
  [AttritionRiskPct] DECIMAL(9,2) NOT NULL CONSTRAINT [DF_OrganizationLocationsSites_AttritionRiskPct] DEFAULT 0,
  [HealthStatus] NVARCHAR(40) NOT NULL,
  [CostCenter] NVARCHAR(100) NOT NULL,
  [Description] NVARCHAR(600) NOT NULL,
  [NodeCount] INT NOT NULL CONSTRAINT [DF_OrganizationLocationsSites_NodeCount] DEFAULT 0,
  [DivisionCount] INT NOT NULL CONSTRAINT [DF_OrganizationLocationsSites_DivisionCount] DEFAULT 0,
  [BusinessUnitCount] INT NOT NULL CONSTRAINT [DF_OrganizationLocationsSites_BusinessUnitCount] DEFAULT 0,
  [DepartmentCount] INT NOT NULL CONSTRAINT [DF_OrganizationLocationsSites_DepartmentCount] DEFAULT 0,
  [TeamCount] INT NOT NULL CONSTRAINT [DF_OrganizationLocationsSites_TeamCount] DEFAULT 0,
  [ParentChainJson] NVARCHAR(MAX) NOT NULL,
  [RelatedItemsJson] NVARCHAR(MAX) NOT NULL,
  [SourceSnapshotJson] NVARCHAR(MAX) NOT NULL,
  [LastSyncedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_OrganizationLocationsSites_LastSyncedAt] DEFAULT SYSUTCDATETIME(),
  CONSTRAINT [UQ_OrganizationLocationsSites_Source] UNIQUE ([SourceSystem], [RecordType], [SourceCode]),
  CONSTRAINT [CK_OrganizationLocationsSites_ParentChainJson] CHECK (ISJSON([ParentChainJson]) = 1),
  CONSTRAINT [CK_OrganizationLocationsSites_RelatedItemsJson] CHECK (ISJSON([RelatedItemsJson]) = 1),
  CONSTRAINT [CK_OrganizationLocationsSites_SourceSnapshotJson] CHECK (ISJSON([SourceSnapshotJson]) = 1)
);`);
    dbReady.value = true;
  }

  return pool;
};

const regionForSite = (name: string) => {
  const n = name.toUpperCase();
  if (['IDI_ORO', 'AGEGE', 'TCM'].includes(n)) return 'Lagos State';
  if (n.includes('NAVAL') || n === 'NND') return 'Lagos State';
  if (n.includes('PORT HARCOURT') || n === 'PHC') return 'Rivers State';
  if (n === 'SPIE' || n === 'BW_ABO') return 'Project Sites';
  if (n.includes('UNASSIGNED')) return 'Unassigned';
  return 'Nigeria';
};

const categoryForSite = (name: string): LocationSiteRecord['siteCategory'] => {
  const n = name.toUpperCase();
  if (n.includes('UNASSIGNED')) return 'Field Site';
  if (n === 'IDI_ORO') return 'Head Office';
  if (n === 'AGEGE' || n === 'TCM' || n.includes('NAVAL')) return 'Yard';
  if (n.includes('PORT HARCOURT')) return 'Operational Hub';
  return 'Field Site';
};

const healthFrom = (headcount: number, missingManagerCount: number): HealthStatus => {
  if (!headcount || missingManagerCount / Math.max(headcount, 1) >= 0.35) return 'Critical';
  if (missingManagerCount > 0) return 'Needs Attention';
  return 'Healthy';
};

const buildRowsWithInferredLocations = (employees: SagePayrollEmployee[]) => {
  const reportLocationsByManager = new Map<string, string[]>();
  const codeByLocationName = new Map<string, string>();
  for (const employee of employees) {
    const location = siteName(employee);
    const code = siteCode(employee);
    if (location && code && !codeByLocationName.has(location.toLowerCase())) {
      codeByLocationName.set(location.toLowerCase(), code);
    }
    const managerCode = clean(employee.managerEmployeeCode) || clean(employee.managerName).split(' ')[0];
    if (!managerCode || !location) continue;
    const key = managerCode.replace(/_/g, '').toLowerCase();
    const rows = reportLocationsByManager.get(key) || [];
    rows.push(location);
    reportLocationsByManager.set(key, rows);
  }

  return employees
    .map((employee) => {
      let code = siteCode(employee);
      let name = siteName(employee);
      let inferred = false;
      if (!name) {
        const reportLocation = mostCommon(reportLocationsByManager.get(clean(employee.employeeCode).replace(/_/g, '').toLowerCase()) || [], '');
        if (reportLocation) {
          name = reportLocation;
          code = codeByLocationName.get(reportLocation.toLowerCase()) || reportLocation.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '');
          inferred = true;
        }
      }
      if (!name && isTerminated(employee)) return null;
      return {
        employee,
        code: code || 'UNASSIGNED-LOCATION',
        name: name || 'Unassigned Location',
        inferred,
      };
    })
    .filter((row): row is { employee: SagePayrollEmployee; code: string; name: string; inferred: boolean } => Boolean(row));
};

const buildLocationRecordsFromSage = (employees: SagePayrollEmployee[]): LocationSiteRecord[] => {
  const rows = buildRowsWithInferredLocations(employees);
  const siteGroups = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = row.code.toUpperCase();
    const group = siteGroups.get(key) || [];
    group.push(row);
    siteGroups.set(key, group);
  }

  const siteRecords: LocationSiteRecord[] = [...siteGroups.entries()].map(([code, group]) => {
    const site = mostCommon(group.map((row) => row.name), code);
    const people = group.map((row) => row.employee);
    const managers = uniqueSorted(people.map((employee) => clean(employee.managerName)).filter(Boolean));
    const missingManagerCount = people.filter((employee) => !clean(employee.managerName)).length;
    const departments = uniqueSorted(people.map(departmentName).filter((name) => name !== 'Unassigned Department'));
    const leader = mostCommon(people.map((employee) => clean(employee.managerName)).filter(Boolean), 'Unassigned Site Leader');
    const payroll = people.reduce((sum, employee) => sum + money(employee.annualSalary), 0);
    const healthStatus = healthFrom(people.length, missingManagerCount);
    const relatedItems: RelatedItem[] = departments.map((department) => {
      const departmentPeople = people.filter((employee) => departmentName(employee) === department);
      const departmentMissingManagers = departmentPeople.filter((employee) => !clean(employee.managerName)).length;
      return {
        id: `site-${slug(code)}-dept-${slug(department)}`,
        name: department,
        kind: 'Department',
        leader: mostCommon(departmentPeople.map((employee) => clean(employee.managerName)).filter(Boolean), 'Unassigned Department Leader'),
        headcount: departmentPeople.length,
        openRoles: 0,
        healthStatus: healthFrom(departmentPeople.length, departmentMissingManagers),
      };
    });

    return {
      id: `site-${slug(code)}`,
      name: site,
      recordType: 'Site' as const,
      parentName: regionForSite(site),
      parentChain: [regionForSite(site)],
      region: regionForSite(site),
      country: 'Nigeria',
      siteCategory: categoryForSite(site),
      leader,
      location: site,
      headcount: people.length,
      openRoles: 0,
      budgetUsd: payroll,
      payrollUsd: payroll,
      spanOfControl: managers.length ? round1(people.length / managers.length) : people.length,
      successionCoveragePct: round1(((people.length - missingManagerCount) / Math.max(people.length, 1)) * 100),
      attritionRiskPct: round1((missingManagerCount / Math.max(people.length, 1)) * 100),
      healthStatus,
      costCenter: code,
      description: group.some((row) => row.inferred)
        ? `Sage Payroll site ${site}; includes employee locations inferred from direct-report site assignments where Sage site fields are blank.`
        : `Sage Payroll site ${site} with ${people.length} active employee${people.length === 1 ? '' : 's'}.`,
      nodeCount: relatedItems.length,
      divisionCount: 0,
      businessUnitCount: 0,
      departmentCount: relatedItems.length,
      teamCount: 0,
      relatedItems,
    };
  }).sort((a, b) => b.headcount - a.headcount || a.name.localeCompare(b.name));

  const regionGroups = uniqueSorted(siteRecords.map((site) => site.region));
  const locationRecords: LocationSiteRecord[] = regionGroups.map((region) => {
    const sites = siteRecords.filter((site) => site.region === region);
    const headcount = sites.reduce((sum, site) => sum + site.headcount, 0);
    const payroll = sites.reduce((sum, site) => sum + site.payrollUsd, 0);
    const relatedItems = sites.map((site) => ({
      id: site.id,
      name: site.name,
      kind: 'Site' as const,
      leader: site.leader,
      headcount: site.headcount,
      openRoles: site.openRoles,
      healthStatus: site.healthStatus,
    }));

    return {
      id: `location-${slug(region)}`,
      name: region,
      recordType: 'Location',
      parentName: 'Nigeria',
      parentChain: ['Nigeria'],
      region,
      country: 'Nigeria',
      siteCategory: 'State',
      leader: [...sites].sort((a, b) => b.headcount - a.headcount)[0]?.leader || 'Unassigned Location Leader',
      location: region,
      headcount,
      openRoles: 0,
      budgetUsd: payroll,
      payrollUsd: payroll,
      spanOfControl: sites.length ? round1(sites.reduce((sum, site) => sum + site.spanOfControl, 0) / sites.length) : 0,
      successionCoveragePct: sites.length ? round1(sites.reduce((sum, site) => sum + site.successionCoveragePct, 0) / sites.length) : 0,
      attritionRiskPct: sites.length ? round1(sites.reduce((sum, site) => sum + site.attritionRiskPct, 0) / sites.length) : 0,
      healthStatus: sites.some((site) => site.healthStatus === 'Critical') ? 'Critical' : sites.some((site) => site.healthStatus === 'Needs Attention') ? 'Needs Attention' : 'Healthy',
      costCenter: 'MULTI-SITE',
      description: `Sage Payroll regional roll-up covering ${sites.length} site${sites.length === 1 ? '' : 's'} in ${region}.`,
      nodeCount: sites.reduce((sum, site) => sum + site.nodeCount, 0),
      divisionCount: 0,
      businessUnitCount: 0,
      departmentCount: sites.reduce((sum, site) => sum + site.departmentCount, 0),
      teamCount: 0,
      relatedItems,
    };
  });

  return [...locationRecords, ...siteRecords];
};

const persistRecords = async (records: LocationSiteRecord[]) => {
  const pool = await ensureDb();
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    const sourceCodeFor = (record: LocationSiteRecord) => record.recordType === 'Location' ? record.name : record.costCenter;
    const active = new Set(records.map((record) => `${record.recordType}|${sourceCodeFor(record)}`));
    const existing = await new sql.Request(tx).query(`SELECT [RecordType],[SourceCode] FROM [hris].[OrganizationLocationsSites] WHERE [SourceSystem]=N'Sage Payroll'`);
    for (const row of existing.recordset) {
      if (active.has(`${row.RecordType}|${row.SourceCode}`)) continue;
      await new sql.Request(tx)
        .input('RecordType', sql.NVarChar(20), row.RecordType)
        .input('SourceCode', sql.NVarChar(100), row.SourceCode)
        .query(`DELETE FROM [hris].[OrganizationLocationsSites] WHERE [SourceSystem]=N'Sage Payroll' AND [RecordType]=@RecordType AND [SourceCode]=@SourceCode`);
    }

    for (const record of records) {
      await new sql.Request(tx)
        .input('Id', sql.NVarChar(140), record.id)
        .input('SourceSystem', sql.NVarChar(80), 'Sage Payroll')
        .input('SourceCode', sql.NVarChar(100), sourceCodeFor(record))
        .input('Name', sql.NVarChar(180), record.name)
        .input('RecordType', sql.NVarChar(20), record.recordType)
        .input('ParentName', sql.NVarChar(180), record.parentName)
        .input('Region', sql.NVarChar(180), record.region)
        .input('Country', sql.NVarChar(100), record.country)
        .input('SiteCategory', sql.NVarChar(60), record.siteCategory)
        .input('Leader', sql.NVarChar(220), record.leader)
        .input('Location', sql.NVarChar(180), record.location)
        .input('Headcount', sql.Int, record.headcount)
        .input('OpenRoles', sql.Int, record.openRoles)
        .input('BudgetUsd', sql.Decimal(19, 2), record.budgetUsd)
        .input('PayrollUsd', sql.Decimal(19, 2), record.payrollUsd)
        .input('SpanOfControl', sql.Decimal(9, 2), record.spanOfControl)
        .input('SuccessionCoveragePct', sql.Decimal(9, 2), record.successionCoveragePct)
        .input('AttritionRiskPct', sql.Decimal(9, 2), record.attritionRiskPct)
        .input('HealthStatus', sql.NVarChar(40), record.healthStatus)
        .input('CostCenter', sql.NVarChar(100), record.costCenter)
        .input('Description', sql.NVarChar(600), record.description)
        .input('NodeCount', sql.Int, record.nodeCount)
        .input('DivisionCount', sql.Int, record.divisionCount)
        .input('BusinessUnitCount', sql.Int, record.businessUnitCount)
        .input('DepartmentCount', sql.Int, record.departmentCount)
        .input('TeamCount', sql.Int, record.teamCount)
        .input('ParentChainJson', sql.NVarChar(sql.MAX), JSON.stringify(record.parentChain))
        .input('RelatedItemsJson', sql.NVarChar(sql.MAX), JSON.stringify(record.relatedItems))
        .input('SourceSnapshotJson', sql.NVarChar(sql.MAX), JSON.stringify({ migratedAt: new Date().toISOString() }))
        .query(`
MERGE [hris].[OrganizationLocationsSites] AS target
USING (SELECT @SourceSystem AS [SourceSystem], @RecordType AS [RecordType], @SourceCode AS [SourceCode]) AS source
ON target.[SourceSystem]=source.[SourceSystem] AND target.[RecordType]=source.[RecordType] AND target.[SourceCode]=source.[SourceCode]
WHEN MATCHED THEN UPDATE SET
  [Id]=@Id,[Name]=@Name,[ParentName]=@ParentName,[Region]=@Region,[Country]=@Country,[SiteCategory]=@SiteCategory,[Leader]=@Leader,[Location]=@Location,
  [Headcount]=@Headcount,[OpenRoles]=@OpenRoles,[BudgetUsd]=@BudgetUsd,[PayrollUsd]=@PayrollUsd,[SpanOfControl]=@SpanOfControl,
  [SuccessionCoveragePct]=@SuccessionCoveragePct,[AttritionRiskPct]=@AttritionRiskPct,[HealthStatus]=@HealthStatus,[CostCenter]=@CostCenter,
  [Description]=@Description,[NodeCount]=@NodeCount,[DivisionCount]=@DivisionCount,[BusinessUnitCount]=@BusinessUnitCount,[DepartmentCount]=@DepartmentCount,
  [TeamCount]=@TeamCount,[ParentChainJson]=@ParentChainJson,[RelatedItemsJson]=@RelatedItemsJson,[SourceSnapshotJson]=@SourceSnapshotJson,[LastSyncedAt]=SYSUTCDATETIME()
WHEN NOT MATCHED THEN INSERT
  ([Id],[SourceSystem],[SourceCode],[Name],[RecordType],[ParentName],[Region],[Country],[SiteCategory],[Leader],[Location],[Headcount],[OpenRoles],[BudgetUsd],[PayrollUsd],[SpanOfControl],[SuccessionCoveragePct],[AttritionRiskPct],[HealthStatus],[CostCenter],[Description],[NodeCount],[DivisionCount],[BusinessUnitCount],[DepartmentCount],[TeamCount],[ParentChainJson],[RelatedItemsJson],[SourceSnapshotJson])
VALUES
  (@Id,@SourceSystem,@SourceCode,@Name,@RecordType,@ParentName,@Region,@Country,@SiteCategory,@Leader,@Location,@Headcount,@OpenRoles,@BudgetUsd,@PayrollUsd,@SpanOfControl,@SuccessionCoveragePct,@AttritionRiskPct,@HealthStatus,@CostCenter,@Description,@NodeCount,@DivisionCount,@BusinessUnitCount,@DepartmentCount,@TeamCount,@ParentChainJson,@RelatedItemsJson,@SourceSnapshotJson);`);
    }
    await tx.commit();
  } catch (error) {
    await tx.rollback();
    throw error;
  }
};

const readPersistedRecords = async (): Promise<LocationSiteRecord[]> => {
  const pool = await ensureDb();
  const result = await pool.request().query(`SELECT * FROM [hris].[OrganizationLocationsSites] WHERE [SourceSystem]=N'Sage Payroll' ORDER BY CASE WHEN [RecordType]=N'Location' THEN 0 ELSE 1 END, [Headcount] DESC, [Name]`);
  return result.recordset.map((row) => ({
    id: row.Id,
    name: row.Name,
    recordType: row.RecordType,
    parentName: row.ParentName,
    parentChain: JSON.parse(row.ParentChainJson || '[]'),
    region: row.Region,
    country: row.Country,
    siteCategory: row.SiteCategory,
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
    nodeCount: Number(row.NodeCount || 0),
    divisionCount: Number(row.DivisionCount || 0),
    businessUnitCount: Number(row.BusinessUnitCount || 0),
    departmentCount: Number(row.DepartmentCount || 0),
    teamCount: Number(row.TeamCount || 0),
    relatedItems: JSON.parse(row.RelatedItemsJson || '[]'),
  }));
};

const average = (values: number[]) => values.length ? round1(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;

const buildPayload = (records: LocationSiteRecord[]): LocationPayload => {
  const siteRecords = records.filter((record) => record.recordType === 'Site');
  const locationRecords = records.filter((record) => record.recordType === 'Location');
  const highestRiskSite = [...siteRecords].sort((a, b) => b.attritionRiskPct - a.attritionRiskPct)[0];
  const largestSite = [...siteRecords].sort((a, b) => b.headcount - a.headcount)[0];
  const unassignedSite = siteRecords.find((site) => site.name === 'Unassigned Location');

  return {
    generatedAt: new Date().toISOString(),
    permissions: { canEdit: true, canExport: true, canViewCosts: true },
    summary: {
      totalRecords: records.length,
      totalLocations: locationRecords.length,
      totalSites: siteRecords.length,
      totalHeadcount: siteRecords.reduce((sum, record) => sum + record.headcount, 0),
      totalOpenRoles: siteRecords.reduce((sum, record) => sum + record.openRoles, 0),
      avgSuccessionCoverage: average(siteRecords.map((record) => record.successionCoveragePct)),
      avgAttritionRisk: average(siteRecords.map((record) => record.attritionRiskPct)),
    },
    filterOptions: {
      recordTypes: ['Location', 'Site'],
      regions: uniqueSorted(records.map((record) => record.region)),
      siteCategories: uniqueSorted(records.map((record) => record.siteCategory)),
      healthStatuses: ['Healthy', 'Needs Attention', 'Critical'],
    },
    records,
    insights: [
      {
        id: 'loc-site-ins-1',
        severity: unassignedSite && unassignedSite.headcount > 0 ? 'high' : 'low',
        title: unassignedSite ? `${unassignedSite.headcount} employees have blank Sage location fields` : 'All employees have Sage locations',
        recommendation: unassignedSite
          ? 'Update Sage Payroll site/location fields for these employees or confirm the unassigned site as a temporary holding location.'
          : 'Sage Payroll location coverage is complete for active employees.',
      },
      {
        id: 'loc-site-ins-2',
        severity: highestRiskSite && highestRiskSite.attritionRiskPct >= 35 ? 'high' : 'medium',
        title: `${highestRiskSite?.name || 'A site'} has the highest manager assignment gap`,
        recommendation: 'Review site manager assignment coverage in Sage Payroll to improve location governance.',
      },
      {
        id: 'loc-site-ins-3',
        severity: largestSite && largestSite.headcount >= 100 ? 'medium' : 'low',
        title: `${largestSite?.name || 'A site'} carries the largest workforce footprint`,
        recommendation: 'Prioritize workforce planning, attendance controls, and supervision coverage for this site.',
      },
    ],
  };
};

export async function syncSageLocationsToOrganizationDb(): Promise<LocationPayload> {
  await ensureDb();
  const { employees } = await readActiveSagePayrollEmployeeKeys();
  const records = buildLocationRecordsFromSage(employees);
  await persistRecords(records);
  return buildPayload(await readPersistedRecords());
}
