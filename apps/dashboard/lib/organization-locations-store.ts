import sql from 'mssql';
import { getDleEnterpriseDbPool, type DleEmployeeDirectoryRow } from '@/lib/dle-enterprise-db';
import type { HealthStatus, LocationSiteRecord, StructureInsight } from '@/lib/organization-data';
import { composePersonDisplayName } from '@/lib/person-display-name';
import { readPayrollEmployees } from '@/lib/payroll-employee-source';
import { readActiveSagePayrollEmployeeKeys, type SagePayrollEmployee } from '@/lib/sage-people-payroll-store';
import {
  AGEGE_TIMESHEET_LOCATION,
  normalizeTimesheetLocationLabel,
  timesheetLocationMatchKey,
} from '@/lib/timesheet-agege-blasting';

const OFFSHORE_LOCATION_NAME = 'OFFSHORE';

export type LocationPayload = {
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
  warning?: string | null;
};

export type OrganizationLocationPerson = {
  employeeCode: string;
  fullName: string;
  managerName: string;
  managerCode: string;
  department: string;
  jobTitle: string;
  locationName: string;
  locationCode: string;
  annualSalary: number;
  terminated: boolean;
};

type RelatedItem = LocationSiteRecord['relatedItems'][number];

const SOURCE_SYSTEM = 'DLE Enterprise HRIS';
const dbReady = { value: false };
const clean = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
const slug = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'unassigned';
const round1 = (value: number) => Math.round(value * 10) / 10;
const money = (value: unknown) => {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
};
const uniqueSorted = (values: string[]) => Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b));
const siteCodeFromName = (name: string) =>
  name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '') || 'UNASSIGNED-LOCATION';

const mostCommon = (values: string[], fallback: string) => {
  const counts = new Map<string, number>();
  for (const value of values.map(clean).filter(Boolean)) counts.set(value, (counts.get(value) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] || fallback;
};

const isInactiveStatus = (status: string) =>
  /resign|terminat|inactiv|retired|exited|dismissed/.test(status.toLowerCase());

const isSecurityRole = (jobTitle: string, displayName: string, managerName: string) => {
  const text = [jobTitle, displayName, managerName].map(clean).join(' ').toLowerCase();
  return text.includes('security') || text.includes('community liaison');
};

const departmentName = (person: OrganizationLocationPerson) => {
  if (isSecurityRole(person.jobTitle, person.fullName, person.managerName)) return 'SECURITY';
  return clean(person.department) || 'Unassigned Department';
};

/** Canonical operating sites that must appear even before Sage is reachable. */
export const CORE_OPERATING_SITES = [
  AGEGE_TIMESHEET_LOCATION,
  'IDI-ORO',
  OFFSHORE_LOCATION_NAME,
] as const;

const TIMESHEET_PLACEHOLDER_SITES = new Set(['abuja', 'bonny', 'lagos hq', 'port harcourt', 'warri']);

export const canonicalOrganizationSiteName = (value: string | null | undefined) => {
  const raw = normalizeTimesheetLocationLabel(value) || clean(value);
  if (!raw) return '';
  const key = timesheetLocationMatchKey(raw);
  if (!key) return '';
  if (/^agege/.test(key) || key.includes('agege')) return AGEGE_TIMESHEET_LOCATION;
  if (/^(idioro|idiidioro|nnd|nigeriannavaldockyard|navaldockyard|lagosidioro)$/.test(key) || key.includes('idioro')) {
    return 'IDI-ORO';
  }
  if (key === 'offshore' || key.startsWith('offshore')) return OFFSHORE_LOCATION_NAME;
  if (key === 'phc' || key.includes('portharcourt')) return 'Port Harcourt';
  if (key === 'lagoshq' || key === 'lagosheadquarters' || key === 'lagosheadoffice') return 'Lagos HQ';
  if (key === 'tcm') return 'TCM';
  if (key === 'warri') return 'Warri';
  if (key === 'bonny') return 'Bonny';
  if (key === 'abuja' || key === 'fct' || key === 'fctabuja') return 'Abuja';
  if (/^(unassigned(location)?|na|none|n\/a)$/.test(key)) return 'Unassigned Location';
  return raw;
};

export const regionForSite = (name: string) => {
  const canonical = canonicalOrganizationSiteName(name) || name;
  const n = canonical.toUpperCase();
  const key = timesheetLocationMatchKey(canonical);
  if (n === OFFSHORE_LOCATION_NAME || key.startsWith('offshore')) return 'Offshore';
  if (['IDI-ORO', 'IDI_ORO', AGEGE_TIMESHEET_LOCATION, 'TCM', 'LAGOS HQ'].includes(n) || n.includes('NAVAL') || n === 'NND') {
    return 'Lagos State';
  }
  if (n.includes('PORT HARCOURT') || n === 'PHC' || n === 'BONNY') return 'Rivers State';
  if (n === 'WARRI') return 'Delta State';
  if (n === 'ABUJA') return 'Federal Capital Territory';
  if (n === 'SPIE' || n === 'BW_ABO' || n === 'BW-ABO') return 'Project Sites';
  if (n.includes('UNASSIGNED')) return 'Unassigned';
  return 'Nigeria';
};

export const categoryForSite = (name: string): LocationSiteRecord['siteCategory'] => {
  const canonical = canonicalOrganizationSiteName(name) || name;
  const n = canonical.toUpperCase();
  if (n.includes('UNASSIGNED')) return 'Field Site';
  if (n === 'IDI-ORO' || n === 'IDI_ORO' || n === 'LAGOS HQ') return 'Head Office';
  if (n === AGEGE_TIMESHEET_LOCATION || n === 'TCM' || n.includes('NAVAL')) return 'Yard';
  if (n.includes('PORT HARCOURT') || n === 'WARRI' || n === 'BONNY' || n === 'ABUJA') return 'Operational Hub';
  if (n === OFFSHORE_LOCATION_NAME) return 'Field Site';
  return 'Field Site';
};

const healthFrom = (headcount: number, missingManagerCount: number): HealthStatus => {
  if (!headcount || missingManagerCount / Math.max(headcount, 1) >= 0.35) return 'Critical';
  if (missingManagerCount > 0) return 'Needs Attention';
  return 'Healthy';
};

const emptySiteRecord = (name: string, code = siteCodeFromName(name)): LocationSiteRecord => {
  const region = regionForSite(name);
  return {
    id: `site-${slug(code)}`,
    name,
    recordType: 'Site',
    parentName: region,
    parentChain: [region],
    region,
    country: 'Nigeria',
    siteCategory: categoryForSite(name),
    leader: 'Unassigned Site Leader',
    location: name,
    headcount: 0,
    openRoles: 0,
    budgetNgn: 0,
    payrollNgn: 0,
    spanOfControl: 0,
    successionCoveragePct: 0,
    attritionRiskPct: 0,
    healthStatus: 'Needs Attention',
    costCenter: code,
    description: `Operating site ${name} with no assigned employees in the current HRIS directory.`,
    nodeCount: 0,
    divisionCount: 0,
    businessUnitCount: 0,
    departmentCount: 0,
    teamCount: 0,
    relatedItems: [],
  };
};

export const personFromDirectoryEmployee = (employee: DleEmployeeDirectoryRow): OrganizationLocationPerson => {
  const rawLocation = employee.location || employee.workLocation || employee.officeLocation || employee.projectSite || '';
  const locationName = canonicalOrganizationSiteName(rawLocation) || (clean(rawLocation) ? clean(rawLocation) : '');
  return {
    employeeCode: clean(employee.employeeCode) || clean(employee.employeeId),
    fullName: clean(employee.fullName),
    managerName: clean(employee.managerName),
    managerCode: '',
    department: clean(employee.department),
    jobTitle: clean(employee.jobTitle) || clean(employee.designation),
    locationName,
    locationCode: siteCodeFromName(locationName || 'Unassigned Location'),
    annualSalary: money(employee.annualSalary),
    terminated: isInactiveStatus(employee.status),
  };
};

export const personFromSageEmployee = (employee: SagePayrollEmployee): OrganizationLocationPerson => {
  const rawLocation = clean(employee.siteName) || clean(employee.hierarchyLocationName);
  const locationName = canonicalOrganizationSiteName(rawLocation) || rawLocation;
  const locationCode = clean(employee.siteCode) || clean(employee.hierarchyLocationCode) || siteCodeFromName(locationName || 'Unassigned Location');
  const status = `${clean(employee.statusName)} ${clean(employee.statusCode)}`.toLowerCase();
  return {
    employeeCode: clean(employee.employeeCode) || clean(employee.directoryEmployeeCode),
    fullName: composePersonDisplayName({
      title: employee.title,
      firstName: employee.firstNames,
      middleName: employee.middleName,
      lastName: employee.lastName,
      fallback: employee.displayName,
    }) || clean(employee.displayName),
    managerName: clean(employee.managerName),
    managerCode: clean(employee.managerEmployeeCode),
    department: clean(employee.departmentName) || clean(employee.hierarchyDepartmentName),
    jobTitle: clean(employee.jobTitle),
    locationName,
    locationCode,
    annualSalary: money(employee.annualSalary),
    terminated: Boolean(employee.terminationDate) || isInactiveStatus(status),
  };
};

const buildRowsWithInferredLocations = (people: OrganizationLocationPerson[]) => {
  const reportLocationsByManager = new Map<string, string[]>();
  for (const person of people) {
    const location = canonicalOrganizationSiteName(person.locationName) || person.locationName;
    const managerCode = person.managerCode || person.managerName.split(' ')[0];
    if (!managerCode || !location) continue;
    const key = managerCode.replace(/_/g, '').toLowerCase();
    const rows = reportLocationsByManager.get(key) || [];
    rows.push(location);
    reportLocationsByManager.set(key, rows);
  }

  return people
    .map((person) => {
      let name = canonicalOrganizationSiteName(person.locationName) || person.locationName;
      let inferred = false;
      if (!name) {
        const reportLocation = mostCommon(reportLocationsByManager.get(person.employeeCode.replace(/_/g, '').toLowerCase()) || [], '');
        if (reportLocation) {
          name = canonicalOrganizationSiteName(reportLocation) || reportLocation;
          inferred = true;
        }
      }
      if (!name && person.terminated) return null;
      const resolvedName = name || 'Unassigned Location';
      return {
        person,
        code: siteCodeFromName(resolvedName),
        name: resolvedName,
        inferred,
      };
    })
    .filter((row): row is { person: OrganizationLocationPerson; code: string; name: string; inferred: boolean } => Boolean(row));
};

const mergeSiteRecords = (primary: LocationSiteRecord[], extras: LocationSiteRecord[]) => {
  const byCode = new Map<string, LocationSiteRecord>();
  for (const record of [...primary, ...extras]) {
    const key = `${record.recordType}|${record.costCenter.toUpperCase()}|${timesheetLocationMatchKey(record.name)}`;
    const existing = byCode.get(key);
    if (!existing || record.headcount > existing.headcount) byCode.set(key, record);
  }
  return [...byCode.values()];
};

export const buildLocationRecordsFromPeople = (
  people: OrganizationLocationPerson[],
  catalogSiteNames: string[] = [...CORE_OPERATING_SITES],
): LocationSiteRecord[] => {
  const rows = buildRowsWithInferredLocations(people);
  const siteGroups = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = row.code.toUpperCase();
    const group = siteGroups.get(key) || [];
    group.push(row);
    siteGroups.set(key, group);
  }

  const siteRecords: LocationSiteRecord[] = [...siteGroups.entries()].map(([code, group]) => {
    const site = mostCommon(group.map((row) => row.name), code);
    const members = group.map((row) => row.person);
    const managers = uniqueSorted(members.map((person) => clean(person.managerName)).filter(Boolean));
    const missingManagerCount = members.filter((person) => !clean(person.managerName)).length;
    const departments = uniqueSorted(members.map(departmentName).filter((name) => name !== 'Unassigned Department'));
    const leader = mostCommon(members.map((person) => clean(person.managerName)).filter(Boolean), 'Unassigned Site Leader');
    const payroll = members.reduce((sum, person) => sum + money(person.annualSalary), 0);
    const healthStatus = healthFrom(members.length, missingManagerCount);
    const relatedItems: RelatedItem[] = departments.map((department) => {
      const departmentPeople = members.filter((person) => departmentName(person) === department);
      const departmentMissingManagers = departmentPeople.filter((person) => !clean(person.managerName)).length;
      return {
        id: `site-${slug(code)}-dept-${slug(department)}`,
        name: department,
        kind: 'Department',
        leader: mostCommon(departmentPeople.map((person) => clean(person.managerName)).filter(Boolean), 'Unassigned Department Leader'),
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
      headcount: members.length,
      openRoles: 0,
      budgetNgn: payroll,
      payrollNgn: payroll,
      spanOfControl: managers.length ? round1(members.length / managers.length) : members.length,
      successionCoveragePct: round1(((members.length - missingManagerCount) / Math.max(members.length, 1)) * 100),
      attritionRiskPct: round1((missingManagerCount / Math.max(members.length, 1)) * 100),
      healthStatus,
      costCenter: code,
      description: group.some((row) => row.inferred)
        ? `HRIS site ${site}; includes employee locations inferred from direct-report site assignments where location fields are blank.`
        : `Operating site ${site} with ${members.length} active employee${members.length === 1 ? '' : 's'}.`,
      nodeCount: relatedItems.length,
      divisionCount: 0,
      businessUnitCount: 0,
      departmentCount: relatedItems.length,
      teamCount: 0,
      relatedItems,
    };
  }).sort((a, b) => b.headcount - a.headcount || a.name.localeCompare(b.name));

  const existingKeys = new Set(siteRecords.map((site) => timesheetLocationMatchKey(site.name)));
  const catalogRecords = catalogSiteNames
    .map((name) => canonicalOrganizationSiteName(name) || clean(name))
    .filter((name) => name && !existingKeys.has(timesheetLocationMatchKey(name)))
    .map((name) => emptySiteRecord(name));

  const allSites = mergeSiteRecords(siteRecords, catalogRecords).sort((a, b) => b.headcount - a.headcount || a.name.localeCompare(b.name));

  const regionGroups = uniqueSorted(allSites.map((site) => site.region));
  const locationRecords: LocationSiteRecord[] = regionGroups.map((region) => {
    const sites = allSites.filter((site) => site.region === region);
    const headcount = sites.reduce((sum, site) => sum + site.headcount, 0);
    const payroll = sites.reduce((sum, site) => sum + site.payrollNgn, 0);
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
      recordType: 'Location' as const,
      parentName: 'Nigeria',
      parentChain: ['Nigeria'],
      region,
      country: 'Nigeria',
      siteCategory: 'State',
      leader: [...sites].sort((a, b) => b.headcount - a.headcount)[0]?.leader || 'Unassigned Location Leader',
      location: region,
      headcount,
      openRoles: 0,
      budgetNgn: payroll,
      payrollNgn: payroll,
      spanOfControl: sites.length ? round1(sites.reduce((sum, site) => sum + site.spanOfControl, 0) / sites.length) : 0,
      successionCoveragePct: sites.length ? round1(sites.reduce((sum, site) => sum + site.successionCoveragePct, 0) / sites.length) : 0,
      attritionRiskPct: sites.length ? round1(sites.reduce((sum, site) => sum + site.attritionRiskPct, 0) / sites.length) : 0,
      healthStatus: sites.some((site) => site.healthStatus === 'Critical')
        ? 'Critical'
        : sites.some((site) => site.healthStatus === 'Needs Attention')
          ? 'Needs Attention'
          : 'Healthy',
      costCenter: 'MULTI-SITE',
      description: `Regional roll-up covering ${sites.length} site${sites.length === 1 ? '' : 's'} in ${region}.`,
      nodeCount: sites.reduce((sum, site) => sum + site.nodeCount, 0),
      divisionCount: 0,
      businessUnitCount: 0,
      departmentCount: sites.reduce((sum, site) => sum + site.departmentCount, 0),
      teamCount: 0,
      relatedItems,
    };
  });

  return [...locationRecords, ...allSites];
};

const ensureDb = async () => {
  const pool = await getDleEnterpriseDbPool();
  if (!pool) return null;

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
  [budgetNgn] DECIMAL(19,2) NOT NULL CONSTRAINT [DF_OrganizationLocationsSites_budgetNgn] DEFAULT 0,
  [payrollNgn] DECIMAL(19,2) NOT NULL CONSTRAINT [DF_OrganizationLocationsSites_payrollNgn] DEFAULT 0,
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
);
IF COL_LENGTH(N'hris.OrganizationLocationsSites', N'budgetNgn') IS NULL AND COL_LENGTH(N'hris.OrganizationLocationsSites', N'BudgetUsd') IS NOT NULL
  EXEC sp_rename N'hris.OrganizationLocationsSites.BudgetUsd', N'budgetNgn', N'COLUMN';
IF COL_LENGTH(N'hris.OrganizationLocationsSites', N'payrollNgn') IS NULL AND COL_LENGTH(N'hris.OrganizationLocationsSites', N'PayrollUsd') IS NOT NULL
  EXEC sp_rename N'hris.OrganizationLocationsSites.PayrollUsd', N'payrollNgn', N'COLUMN';
IF COL_LENGTH(N'hris.OrganizationLocationsSites', N'budgetNgn') IS NULL
  ALTER TABLE [hris].[OrganizationLocationsSites] ADD [budgetNgn] DECIMAL(19,2) NOT NULL CONSTRAINT [DF_OrganizationLocationsSites_budgetNgn] DEFAULT 0;
IF COL_LENGTH(N'hris.OrganizationLocationsSites', N'payrollNgn') IS NULL
  ALTER TABLE [hris].[OrganizationLocationsSites] ADD [payrollNgn] DECIMAL(19,2) NOT NULL CONSTRAINT [DF_OrganizationLocationsSites_payrollNgn] DEFAULT 0;`);
    dbReady.value = true;
  }

  return pool;
};

const persistRecords = async (records: LocationSiteRecord[]) => {
  const pool = await ensureDb();
  if (!pool) return;
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    await new sql.Request(tx).query(`DELETE FROM [hris].[OrganizationLocationsSites] WHERE [SourceSystem]=N'Sage Payroll'`);
    const sourceCodeFor = (record: LocationSiteRecord) => (record.recordType === 'Location' ? record.name : record.costCenter);
    const active = new Set(records.map((record) => `${record.recordType}|${sourceCodeFor(record)}`));
    const existing = await new sql.Request(tx)
      .input('SourceSystem', sql.NVarChar(80), SOURCE_SYSTEM)
      .query(`SELECT [RecordType],[SourceCode] FROM [hris].[OrganizationLocationsSites] WHERE [SourceSystem]=@SourceSystem`);
    for (const row of existing.recordset) {
      if (active.has(`${row.RecordType}|${row.SourceCode}`)) continue;
      await new sql.Request(tx)
        .input('SourceSystem', sql.NVarChar(80), SOURCE_SYSTEM)
        .input('RecordType', sql.NVarChar(20), row.RecordType)
        .input('SourceCode', sql.NVarChar(100), row.SourceCode)
        .query(`DELETE FROM [hris].[OrganizationLocationsSites] WHERE [SourceSystem]=@SourceSystem AND [RecordType]=@RecordType AND [SourceCode]=@SourceCode`);
    }

    for (const record of records) {
      await new sql.Request(tx)
        .input('Id', sql.NVarChar(140), record.id)
        .input('SourceSystem', sql.NVarChar(80), SOURCE_SYSTEM)
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
        .input('budgetNgn', sql.Decimal(19, 2), record.budgetNgn)
        .input('payrollNgn', sql.Decimal(19, 2), record.payrollNgn)
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
        .input('SourceSnapshotJson', sql.NVarChar(sql.MAX), JSON.stringify({ migratedAt: new Date().toISOString(), source: SOURCE_SYSTEM }))
        .query(`
MERGE [hris].[OrganizationLocationsSites] AS target
USING (SELECT @SourceSystem AS [SourceSystem], @RecordType AS [RecordType], @SourceCode AS [SourceCode]) AS source
ON target.[SourceSystem]=source.[SourceSystem] AND target.[RecordType]=source.[RecordType] AND target.[SourceCode]=source.[SourceCode]
WHEN MATCHED THEN UPDATE SET
  [Id]=@Id,[Name]=@Name,[ParentName]=@ParentName,[Region]=@Region,[Country]=@Country,[SiteCategory]=@SiteCategory,[Leader]=@Leader,[Location]=@Location,
  [Headcount]=@Headcount,[OpenRoles]=@OpenRoles,[budgetNgn]=@budgetNgn,[payrollNgn]=@payrollNgn,[SpanOfControl]=@SpanOfControl,
  [SuccessionCoveragePct]=@SuccessionCoveragePct,[AttritionRiskPct]=@AttritionRiskPct,[HealthStatus]=@HealthStatus,[CostCenter]=@CostCenter,
  [Description]=@Description,[NodeCount]=@NodeCount,[DivisionCount]=@DivisionCount,[BusinessUnitCount]=@BusinessUnitCount,[DepartmentCount]=@DepartmentCount,
  [TeamCount]=@TeamCount,[ParentChainJson]=@ParentChainJson,[RelatedItemsJson]=@RelatedItemsJson,[SourceSnapshotJson]=@SourceSnapshotJson,[LastSyncedAt]=SYSUTCDATETIME()
WHEN NOT MATCHED THEN INSERT
  ([Id],[SourceSystem],[SourceCode],[Name],[RecordType],[ParentName],[Region],[Country],[SiteCategory],[Leader],[Location],[Headcount],[OpenRoles],[budgetNgn],[payrollNgn],[SpanOfControl],[SuccessionCoveragePct],[AttritionRiskPct],[HealthStatus],[CostCenter],[Description],[NodeCount],[DivisionCount],[BusinessUnitCount],[DepartmentCount],[TeamCount],[ParentChainJson],[RelatedItemsJson],[SourceSnapshotJson])
VALUES
  (@Id,@SourceSystem,@SourceCode,@Name,@RecordType,@ParentName,@Region,@Country,@SiteCategory,@Leader,@Location,@Headcount,@OpenRoles,@budgetNgn,@payrollNgn,@SpanOfControl,@SuccessionCoveragePct,@AttritionRiskPct,@HealthStatus,@CostCenter,@Description,@NodeCount,@DivisionCount,@BusinessUnitCount,@DepartmentCount,@TeamCount,@ParentChainJson,@RelatedItemsJson,@SourceSnapshotJson);`);
    }
    await tx.commit();
  } catch (error) {
    await tx.rollback();
    throw error;
  }
};

const mapPersistedRow = (row: any): LocationSiteRecord => ({
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
  budgetNgn: Number(row.budgetNgn || 0),
  payrollNgn: Number(row.payrollNgn || 0),
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
});

const readPersistedRecords = async (): Promise<LocationSiteRecord[]> => {
  const pool = await ensureDb();
  if (!pool) return [];
  const preferred = await pool.request()
    .input('SourceSystem', sql.NVarChar(80), SOURCE_SYSTEM)
    .query(`SELECT * FROM [hris].[OrganizationLocationsSites] WHERE [SourceSystem]=@SourceSystem ORDER BY CASE WHEN [RecordType]=N'Location' THEN 0 ELSE 1 END, [Headcount] DESC, [Name]`);
  if (preferred.recordset.length) return preferred.recordset.map(mapPersistedRow);
  const fallback = await pool.request().query(`SELECT * FROM [hris].[OrganizationLocationsSites] ORDER BY CASE WHEN [RecordType]=N'Location' THEN 0 ELSE 1 END, [Headcount] DESC, [Name]`);
  return fallback.recordset.map(mapPersistedRow);
};

const readTimesheetCatalogSiteNames = async (): Promise<string[]> => {
  const pool = await getDleEnterpriseDbPool();
  if (!pool) return [];
  try {
    const table = await pool.request().query(`SELECT OBJECT_ID(N'[hris].[TimesheetLocations]', N'U') AS [TableId]`);
    if (!table.recordset[0]?.TableId) return [];
    const result = await pool.request().query(`SELECT [Name],[Site] FROM [hris].[TimesheetLocations] ORDER BY [Name]`);
    return uniqueSorted(
      result.recordset
        .flatMap((row: { Name?: string; Site?: string }) => [canonicalOrganizationSiteName(row.Name) || clean(row.Name), canonicalOrganizationSiteName(row.Site) || clean(row.Site)])
        .filter((name) => name && !/unassigned/i.test(name)),
    );
  } catch (error) {
    console.warn('Timesheet location catalog read failed:', error);
    return [];
  }
};

const trySagePeople = async (): Promise<{ people: OrganizationLocationPerson[]; warning: string | null }> => {
  try {
    const { employees } = await readActiveSagePayrollEmployeeKeys();
    return { people: employees.map(personFromSageEmployee), warning: null };
  } catch (error) {
    const warning = error instanceof Error ? error.message : 'Sage Payroll is unavailable';
    console.warn('Sage location enrichment skipped:', warning);
    return { people: [], warning };
  }
};

const average = (values: number[]) => (values.length ? round1(values.reduce((sum, value) => sum + value, 0) / values.length) : 0);

const buildPayload = (records: LocationSiteRecord[], warning?: string | null): LocationPayload => {
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
    warning: warning || null,
    insights: [
      {
        id: 'loc-site-ins-1',
        severity: unassignedSite && unassignedSite.headcount > 0 ? 'high' : 'low',
        title: unassignedSite && unassignedSite.headcount > 0
          ? `${unassignedSite.headcount} employees have blank location fields`
          : 'All active employees are mapped to an operating site',
        recommendation: unassignedSite && unassignedSite.headcount > 0
          ? 'Update work location / office location / project site on the employee record so they appear under Agege, Idi-Oro, Offshore, or another operating site.'
          : 'HRIS location coverage is complete for active employees.',
      },
      {
        id: 'loc-site-ins-2',
        severity: highestRiskSite && highestRiskSite.attritionRiskPct >= 35 ? 'high' : 'medium',
        title: `${highestRiskSite?.name || 'A site'} has the highest manager assignment gap`,
        recommendation: 'Review site manager assignment coverage in HRIS to improve location governance.',
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

export async function loadOrganizationLocations(): Promise<LocationPayload> {
  const warnings: string[] = [];
  let people: OrganizationLocationPerson[] = [];

  try {
    const source = await readPayrollEmployees();
    people = source.employees.map(personFromDirectoryEmployee).filter((person) => !person.terminated);
    if (source.warning) warnings.push(source.warning);
  } catch (error) {
    warnings.push(error instanceof Error ? error.message : 'Unable to read DLE Enterprise employees.');
  }

  if (!people.length) {
    const sage = await trySagePeople();
    people = sage.people.filter((person) => !person.terminated);
    if (sage.warning) warnings.push(sage.warning);
  }

  const catalogSiteNames = uniqueSorted([
    ...CORE_OPERATING_SITES,
    ...(await readTimesheetCatalogSiteNames()).filter((name) => !TIMESHEET_PLACEHOLDER_SITES.has(name.toLowerCase())),
  ]);
  let records = buildLocationRecordsFromPeople(people, catalogSiteNames);

  if (!records.some((record) => record.recordType === 'Site')) {
    try {
      const persisted = await readPersistedRecords();
      if (persisted.length) records = persisted;
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : 'Unable to read stored organization locations.');
    }
  }

  if (records.length) {
    try {
      await persistRecords(records);
    } catch (error) {
      warnings.push(error instanceof Error ? `Location snapshot was not saved (${error.message}).` : 'Location snapshot was not saved.');
    }
  }

  if (!records.length) {
    records = buildLocationRecordsFromPeople([], [...CORE_OPERATING_SITES]);
  }

  return buildPayload(records, uniqueSorted(warnings).join(' ').trim() || null);
}

/** @deprecated Use loadOrganizationLocations. Kept for recruitment lookups and existing API imports. */
export async function syncSageLocationsToOrganizationDb(): Promise<LocationPayload> {
  return loadOrganizationLocations();
}
