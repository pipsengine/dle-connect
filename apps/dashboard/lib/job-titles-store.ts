import sql from 'mssql';
import { getDleEnterpriseDbPool, type DleEmployeeDirectoryRow } from '@/lib/dle-enterprise-db';
import { formatOrganizationJobTitleLabel } from '@/lib/job-title-label';
import type { HealthStatus, JobGradeRecord, JobTitleRecord, StructureInsight } from '@/lib/organization-data';
import { payrollDataSourceInfo, readPayrollEmployees } from '@/lib/payroll-employee-source';

type JobTitlesPayload = {
  generatedAt: string;
  permissions: {
    canEdit: boolean;
    canExport: boolean;
    canViewCosts: boolean;
  };
  dataSource: ReturnType<typeof payrollDataSourceInfo> & {
    structureSource: 'Sage Payroll Migration' | 'DLE Enterprise HRIS' | 'Local HRIS payroll cache';
    migratedTitleCount: number;
    migrationWarning: string | null;
    independence: string;
  };
  summary: {
    totalTitles: number;
    totalEmployees: number;
    totalOpenPositions: number;
    avgSuccessionCoverage: number;
    avgAttritionRisk: number;
    avgInternalMobility: number;
    titlesNeedingReview: number;
    titleVariants: number;
  };
  filterOptions: {
    families: string[];
    levels: string[];
    grades: string[];
    reportingLevels: string[];
    standardizationStatuses: string[];
    healthStatuses: HealthStatus[];
  };
  titles: JobTitleRecord[];
  insights: StructureInsight[];
};

type DbJobTitleRow = {
  Id: string;
  Code: string;
  Title: string;
  Family: JobGradeRecord['family'];
  TitleLevel: JobGradeRecord['level'];
  GradeCode: string;
  GradeName: string;
  ReportingLevel: JobTitleRecord['reportingLevel'];
  BenchmarkSalaryNgn: number;
  EmployeeCount: number;
  OpenPositions: number;
  DepartmentCount: number;
  LocationCount: number;
  SuccessionCoveragePct: number;
  AttritionRiskPct: number;
  InternalMobilityPct: number;
  HealthStatus: HealthStatus;
  StandardizationStatus: JobTitleRecord['standardizationStatus'];
  BenchmarkPosition: string;
  JobPurpose: string;
  CommonLocationsJson: string;
  DepartmentsJson: string;
  KeyResponsibilitiesJson: string;
};

const SOURCE_SYSTEM = 'Sage Payroll Migration';
const MANUAL_SOURCE = 'HRIS';
const dbReady = { value: false };

const clean = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
const round1 = (value: number) => Math.round(value * 10) / 10;
const roundMoney = (value: number) => Math.round(value * 100) / 100;
const slug = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'unassigned';
const clip = (value: string, max: number) => value.trim().slice(0, max);
const uniqueSorted = (values: string[]) => Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b));

const jobTitleId = (codeSlug: string, titleSlug: string) => {
  const id = `jt-${codeSlug}-${titleSlug}`;
  if (id.length <= 180) return id;
  let hash = 2166136261;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  const suffix = (hash >>> 0).toString(36);
  return `${id.slice(0, 179 - suffix.length)}-${suffix}`;
};

const mostCommon = (values: Array<string | null | undefined>, fallback: string) => {
  const counts = new Map<string, number>();
  for (const value of values.map(clean).filter(Boolean)) counts.set(value, (counts.get(value) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] || fallback;
};

const titleCode = (employee: DleEmployeeDirectoryRow, title: string) => {
  const explicit = clean(employee.designation);
  if (explicit && /^[A-Z]{2,}[A-Z0-9_-]*$/i.test(explicit) && explicit.length <= 30) return explicit.toUpperCase();
  return title.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'UNASSIGNED';
};

const titleName = (employee: DleEmployeeDirectoryRow) =>
  clean(employee.jobTitle) || clean(employee.designation) || 'Unassigned Job Title';

const gradeCode = (employee: DleEmployeeDirectoryRow) =>
  clean(employee.salaryGrade) || clean(employee.jobGrade) || clean(employee.employeeCategory) || clean(employee.employmentType) || 'UNASSIGNED';

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

const familyFor = (title: string, rows: DleEmployeeDirectoryRow[]): JobGradeRecord['family'] => {
  const text = `${title} ${rows.map((row) => `${row.salaryGrade} ${row.jobGrade} ${row.employmentType} ${row.employeeCategory}`).join(' ')}`.toLowerCase();
  if (/(ceo|chief|director|executive|smgt|snm|mgt7|mgt8|mgt9|mgt10)/i.test(text)) return 'Executive';
  if (/(manager|management|mgt|lead|supervisor|head|foreman)/i.test(text)) return 'Management';
  if (/(welder|fitter|operator|technician|driver|rigger|artisan|mechanic|painter|blaster|daily|lumpsum|contract|crane|saw)/i.test(text)) return 'Technical';
  if (/(assistant|clerk|support|admin|security|office|junior|jnr|snr)/i.test(text)) return 'Operations Support';
  return 'Professional';
};

const levelFor = (family: JobGradeRecord['family'], title: string, rows: DleEmployeeDirectoryRow[]): JobGradeRecord['level'] => {
  const text = `${title} ${rows.map((row) => `${row.salaryGrade} ${row.jobGrade}`).join(' ')}`.toLowerCase();
  if (family === 'Executive' || /(smgt|director|chief|ceo|mgt10|mgt9)/i.test(text)) return 'Strategic';
  if (/(senior|lead|manager|mgt|snr|supervisor|head|foreman)/i.test(text)) return 'Senior';
  if (/(junior|trainee|assistant|entry|jnr)/i.test(text)) return 'Entry';
  return 'Mid';
};

const reportingLevelFor = (family: JobGradeRecord['family'], level: JobGradeRecord['level'], rows: DleEmployeeDirectoryRow[]): JobTitleRecord['reportingLevel'] => {
  if (family === 'Executive' || level === 'Strategic') return 'Enterprise';
  const departments = uniqueSorted(rows.map((row) => clean(row.department)));
  const businessUnits = uniqueSorted(rows.map((row) => clean(row.businessUnit)));
  if (businessUnits.length > 1) return 'Division';
  if (departments.length > 1) return 'Department';
  return 'Team';
};

const standardizationStatus = (title: string, rows: DleEmployeeDirectoryRow[]): JobTitleRecord['standardizationStatus'] => {
  const explicitCodes = uniqueSorted(rows.map((row) => clean(row.designation)).filter(Boolean));
  if (title === 'Unassigned Job Title' || !title) return 'Needs Review';
  if (explicitCodes.length > 2) return 'Variant';
  if (rows.some((row) => !clean(row.salaryGrade) && !clean(row.jobGrade))) return 'Needs Review';
  return 'Standard';
};

const healthFrom = (rows: DleEmployeeDirectoryRow[], salaryValues: number[], status: JobTitleRecord['standardizationStatus']): HealthStatus => {
  const missingManagerCount = rows.filter((employee) => !clean(employee.managerName) && !clean(employee.functionalManager) && !clean(employee.departmentHead)).length;
  const missingPayrollCount = rows.length - salaryValues.length;
  if (!rows.length || status === 'Needs Review' || missingManagerCount / rows.length >= 0.35 || missingPayrollCount / rows.length >= 0.2) return 'Critical';
  if (status === 'Variant' || missingManagerCount > 0 || missingPayrollCount > 0) return 'Needs Attention';
  return 'Healthy';
};

const responsibilitiesFor = (title: string, family: JobGradeRecord['family']) => {
  if (family === 'Executive') return ['Set enterprise direction', 'Own governance and performance', 'Approve strategic workforce decisions'];
  if (family === 'Management') return ['Lead team delivery', 'Control work allocation and performance', 'Maintain compliance and reporting discipline'];
  if (family === 'Technical') return ['Execute assigned technical work', 'Maintain quality and safety standards', 'Report productivity and field exceptions'];
  if (family === 'Operations Support') return ['Support operational execution', 'Maintain service records', 'Escalate exceptions and documentation gaps'];
  return [`Deliver ${title.toLowerCase()} responsibilities`, 'Maintain role documentation', 'Support department objectives'];
};

const buildTitlesFromEmployees = (employees: DleEmployeeDirectoryRow[]): JobTitleRecord[] => {
  const groups = new Map<string, DleEmployeeDirectoryRow[]>();
  for (const employee of employees) {
    if (isInactive(employee)) continue;
    const title = titleName(employee);
    const code = titleCode(employee, title);
    // The primary key ignores case, spacing, and punctuation. Group on that
    // key so "JCJT24" / "JCJT24-" and "Fitter Mate" / "Fitter-Mate" stay one row.
    const key = `${slug(code)}|||${slug(title)}`;
    const rows = groups.get(key);
    if (rows) rows.push(employee);
    else groups.set(key, [employee]);
  }

  return [...groups.entries()].map(([key, rows]) => {
    const separator = key.indexOf('|||');
    const codeSlug = key.slice(0, separator);
    const titleSlug = key.slice(separator + 3);
    const title = clip(mostCommon(rows.map(titleName), 'Unassigned Job Title'), 180);
    const code = clip(mostCommon(rows.map((row) => titleCode(row, title)), titleCode(rows[0], title)), 80);
    const grade = mostCommon(rows.map(gradeCode), 'UNASSIGNED');
    const salaryValues = rows.map(monthlyPayroll).filter((value) => value > 0).sort((a, b) => a - b);
    const family = familyFor(title, rows);
    const level = levelFor(family, title, rows);
    const reportingLevel = reportingLevelFor(family, level, rows);
    const standard = standardizationStatus(title, rows);
    const missingManagerCount = rows.filter((employee) => !clean(employee.managerName) && !clean(employee.functionalManager) && !clean(employee.departmentHead)).length;
    const departments = uniqueSorted(rows.map((row) => clean(row.department) || 'Unassigned Department'));
    const locations = uniqueSorted(rows.map((row) => clean(row.projectSite) || clean(row.workLocation) || clean(row.officeLocation) || clean(row.location) || 'Unassigned Location'));
    const tenureRows = rows.map((employee) => Number(employee.yearsOfService || 0)).filter((value) => value >= 3);

    return {
      id: jobTitleId(codeSlug, titleSlug),
      code,
      title,
      family,
      level,
      gradeCode: grade,
      gradeName: grade,
      reportingLevel,
      benchmarkSalaryNgn: roundMoney(salaryValues.length ? salaryValues[Math.floor(salaryValues.length / 2)] : 0),
      employeeCount: rows.length,
      openPositions: 0,
      departmentCount: departments.length,
      locationCount: locations.length,
      successionCoveragePct: round1(((rows.length - missingManagerCount) / Math.max(rows.length, 1)) * 100),
      attritionRiskPct: round1((missingManagerCount / Math.max(rows.length, 1)) * 100),
      internalMobilityPct: round1((tenureRows.length / Math.max(rows.length, 1)) * 100),
      healthStatus: healthFrom(rows, salaryValues, standard),
      standardizationStatus: standard,
      benchmarkPosition: title,
      jobPurpose: `${title} role migrated from Sage payroll/HRIS employee assignments with ${rows.length} active employee${rows.length === 1 ? '' : 's'} across ${departments.length} department${departments.length === 1 ? '' : 's'}.`,
      commonLocations: locations,
      departments,
      keyResponsibilities: responsibilitiesFor(title, family),
    } satisfies JobTitleRecord;
  }).sort((a, b) => b.employeeCount - a.employeeCount || a.title.localeCompare(b.title));
};

const rowToTitle = (row: DbJobTitleRow): JobTitleRecord => ({
  id: row.Id,
  code: row.Code,
  title: row.Title,
  family: row.Family,
  level: row.TitleLevel,
  gradeCode: row.GradeCode,
  gradeName: row.GradeName,
  reportingLevel: row.ReportingLevel,
  benchmarkSalaryNgn: Number(row.BenchmarkSalaryNgn || 0),
  employeeCount: Number(row.EmployeeCount || 0),
  openPositions: Number(row.OpenPositions || 0),
  departmentCount: Number(row.DepartmentCount || 0),
  locationCount: Number(row.LocationCount || 0),
  successionCoveragePct: Number(row.SuccessionCoveragePct || 0),
  attritionRiskPct: Number(row.AttritionRiskPct || 0),
  internalMobilityPct: Number(row.InternalMobilityPct || 0),
  healthStatus: row.HealthStatus,
  standardizationStatus: row.StandardizationStatus,
  benchmarkPosition: row.BenchmarkPosition,
  jobPurpose: row.JobPurpose,
  commonLocations: JSON.parse(row.CommonLocationsJson || '[]'),
  departments: JSON.parse(row.DepartmentsJson || '[]'),
  keyResponsibilities: JSON.parse(row.KeyResponsibilitiesJson || '[]'),
});

const ensureDb = async () => {
  const pool = await getDleEnterpriseDbPool();
  if (!pool) throw new Error('DLE Enterprise database is not configured. Job titles must be stored in the HRIS database for production use.');
  if (!dbReady.value) {
    await pool.request().query(`
IF SCHEMA_ID(N'hris') IS NULL EXEC(N'CREATE SCHEMA [hris]');
IF OBJECT_ID(N'[hris].[OrganizationJobTitles]', N'U') IS NULL
CREATE TABLE [hris].[OrganizationJobTitles] (
  [Id] NVARCHAR(180) NOT NULL CONSTRAINT [PK_OrganizationJobTitles] PRIMARY KEY,
  [SourceSystem] NVARCHAR(80) NOT NULL,
  [Code] NVARCHAR(80) NOT NULL,
  [Title] NVARCHAR(180) NOT NULL,
  [Family] NVARCHAR(40) NOT NULL,
  [TitleLevel] NVARCHAR(40) NOT NULL,
  [GradeCode] NVARCHAR(80) NOT NULL,
  [GradeName] NVARCHAR(180) NOT NULL,
  [ReportingLevel] NVARCHAR(40) NOT NULL,
  [BenchmarkSalaryNgn] DECIMAL(19,2) NOT NULL CONSTRAINT [DF_OrganizationJobTitles_BenchmarkSalaryNgn] DEFAULT 0,
  [EmployeeCount] INT NOT NULL CONSTRAINT [DF_OrganizationJobTitles_EmployeeCount] DEFAULT 0,
  [OpenPositions] INT NOT NULL CONSTRAINT [DF_OrganizationJobTitles_OpenPositions] DEFAULT 0,
  [DepartmentCount] INT NOT NULL CONSTRAINT [DF_OrganizationJobTitles_DepartmentCount] DEFAULT 0,
  [LocationCount] INT NOT NULL CONSTRAINT [DF_OrganizationJobTitles_LocationCount] DEFAULT 0,
  [SuccessionCoveragePct] DECIMAL(9,2) NOT NULL CONSTRAINT [DF_OrganizationJobTitles_SuccessionCoveragePct] DEFAULT 0,
  [AttritionRiskPct] DECIMAL(9,2) NOT NULL CONSTRAINT [DF_OrganizationJobTitles_AttritionRiskPct] DEFAULT 0,
  [InternalMobilityPct] DECIMAL(9,2) NOT NULL CONSTRAINT [DF_OrganizationJobTitles_InternalMobilityPct] DEFAULT 0,
  [HealthStatus] NVARCHAR(40) NOT NULL,
  [StandardizationStatus] NVARCHAR(40) NOT NULL,
  [BenchmarkPosition] NVARCHAR(180) NOT NULL,
  [JobPurpose] NVARCHAR(800) NOT NULL,
  [CommonLocationsJson] NVARCHAR(MAX) NOT NULL,
  [DepartmentsJson] NVARCHAR(MAX) NOT NULL,
  [KeyResponsibilitiesJson] NVARCHAR(MAX) NOT NULL,
  [SourceSnapshotJson] NVARCHAR(MAX) NOT NULL,
  [LastSyncedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_OrganizationJobTitles_LastSyncedAt] DEFAULT SYSUTCDATETIME(),
  CONSTRAINT [UQ_OrganizationJobTitles_CodeTitle] UNIQUE ([Code], [Title]),
  CONSTRAINT [CK_OrganizationJobTitles_CommonLocationsJson] CHECK (ISJSON([CommonLocationsJson]) = 1),
  CONSTRAINT [CK_OrganizationJobTitles_DepartmentsJson] CHECK (ISJSON([DepartmentsJson]) = 1),
  CONSTRAINT [CK_OrganizationJobTitles_KeyResponsibilitiesJson] CHECK (ISJSON([KeyResponsibilitiesJson]) = 1),
  CONSTRAINT [CK_OrganizationJobTitles_SourceSnapshotJson] CHECK (ISJSON([SourceSnapshotJson]) = 1)
);`);
    dbReady.value = true;
  }
  return pool;
};

const syncSageJobTitles = async () => {
  const source = await readPayrollEmployees();
  const titles = buildTitlesFromEmployees(source.employees);
  const pool = await ensureDb();
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    const activeIds = new Set(titles.map((title) => title.id));
    const existing = await new sql.Request(tx).query(`SELECT [Id] FROM [hris].[OrganizationJobTitles] WHERE [SourceSystem]=N'${SOURCE_SYSTEM}'`);
    for (const row of existing.recordset || []) {
      if (activeIds.has(String(row.Id))) continue;
      await new sql.Request(tx)
        .input('Id', sql.NVarChar(180), String(row.Id))
        .query(`DELETE FROM [hris].[OrganizationJobTitles] WHERE [SourceSystem]=N'${SOURCE_SYSTEM}' AND [Id]=@Id`);
    }
    for (const title of titles) {
      await new sql.Request(tx)
        .input('Id', sql.NVarChar(180), title.id)
        .input('SourceSystem', sql.NVarChar(80), SOURCE_SYSTEM)
        .input('Code', sql.NVarChar(80), title.code)
        .input('Title', sql.NVarChar(180), title.title)
        .input('Family', sql.NVarChar(40), title.family)
        .input('TitleLevel', sql.NVarChar(40), title.level)
        .input('GradeCode', sql.NVarChar(80), title.gradeCode)
        .input('GradeName', sql.NVarChar(180), title.gradeName)
        .input('ReportingLevel', sql.NVarChar(40), title.reportingLevel)
        .input('BenchmarkSalaryNgn', sql.Decimal(19, 2), title.benchmarkSalaryNgn)
        .input('EmployeeCount', sql.Int, title.employeeCount)
        .input('OpenPositions', sql.Int, title.openPositions)
        .input('DepartmentCount', sql.Int, title.departmentCount)
        .input('LocationCount', sql.Int, title.locationCount)
        .input('SuccessionCoveragePct', sql.Decimal(9, 2), title.successionCoveragePct)
        .input('AttritionRiskPct', sql.Decimal(9, 2), title.attritionRiskPct)
        .input('InternalMobilityPct', sql.Decimal(9, 2), title.internalMobilityPct)
        .input('HealthStatus', sql.NVarChar(40), title.healthStatus)
        .input('StandardizationStatus', sql.NVarChar(40), title.standardizationStatus)
        .input('BenchmarkPosition', sql.NVarChar(180), title.benchmarkPosition)
        .input('JobPurpose', sql.NVarChar(800), title.jobPurpose)
        .input('CommonLocationsJson', sql.NVarChar(sql.MAX), JSON.stringify(title.commonLocations))
        .input('DepartmentsJson', sql.NVarChar(sql.MAX), JSON.stringify(title.departments))
        .input('KeyResponsibilitiesJson', sql.NVarChar(sql.MAX), JSON.stringify(title.keyResponsibilities))
        .input('ManualSource', sql.NVarChar(80), MANUAL_SOURCE)
        .input('SourceSnapshotJson', sql.NVarChar(sql.MAX), JSON.stringify({ migratedAt: new Date().toISOString(), source: SOURCE_SYSTEM }))
        .query(`
IF EXISTS (
  SELECT 1 FROM [hris].[OrganizationJobTitles]
  WHERE [SourceSystem]=@ManualSource AND [Code]=@Code AND [Title]=@Title AND [Id]<>@Id
)
BEGIN
  UPDATE [hris].[OrganizationJobTitles]
  SET [EmployeeCount]=@EmployeeCount,[DepartmentCount]=@DepartmentCount,[LocationCount]=@LocationCount,
    [SuccessionCoveragePct]=@SuccessionCoveragePct,[AttritionRiskPct]=@AttritionRiskPct,[InternalMobilityPct]=@InternalMobilityPct,
    [BenchmarkSalaryNgn]=@BenchmarkSalaryNgn,[CommonLocationsJson]=@CommonLocationsJson,[DepartmentsJson]=@DepartmentsJson,
    [LastSyncedAt]=SYSUTCDATETIME()
  WHERE [SourceSystem]=@ManualSource AND [Code]=@Code AND [Title]=@Title;
END
ELSE
BEGIN
  DELETE FROM [hris].[OrganizationJobTitles]
  WHERE [Code]=@Code AND [Title]=@Title AND [Id]<>@Id AND [SourceSystem]<>@ManualSource;

  UPDATE [hris].[OrganizationJobTitles]
  SET [EmployeeCount]=@EmployeeCount,[DepartmentCount]=@DepartmentCount,[LocationCount]=@LocationCount,
    [SuccessionCoveragePct]=@SuccessionCoveragePct,[AttritionRiskPct]=@AttritionRiskPct,[InternalMobilityPct]=@InternalMobilityPct,
    [BenchmarkSalaryNgn]=@BenchmarkSalaryNgn,[CommonLocationsJson]=@CommonLocationsJson,[DepartmentsJson]=@DepartmentsJson,
    [LastSyncedAt]=SYSUTCDATETIME()
  WHERE [Id]=@Id AND [SourceSystem]=@ManualSource;

  UPDATE [hris].[OrganizationJobTitles]
  SET [SourceSystem]=@SourceSystem,[Code]=@Code,[Title]=@Title,[Family]=@Family,[TitleLevel]=@TitleLevel,[GradeCode]=@GradeCode,[GradeName]=@GradeName,
    [ReportingLevel]=@ReportingLevel,[BenchmarkSalaryNgn]=@BenchmarkSalaryNgn,[EmployeeCount]=@EmployeeCount,[OpenPositions]=@OpenPositions,
    [DepartmentCount]=@DepartmentCount,[LocationCount]=@LocationCount,[SuccessionCoveragePct]=@SuccessionCoveragePct,[AttritionRiskPct]=@AttritionRiskPct,
    [InternalMobilityPct]=@InternalMobilityPct,[HealthStatus]=@HealthStatus,[StandardizationStatus]=@StandardizationStatus,[BenchmarkPosition]=@BenchmarkPosition,
    [JobPurpose]=@JobPurpose,[CommonLocationsJson]=@CommonLocationsJson,[DepartmentsJson]=@DepartmentsJson,[KeyResponsibilitiesJson]=@KeyResponsibilitiesJson,
    [SourceSnapshotJson]=@SourceSnapshotJson,[LastSyncedAt]=SYSUTCDATETIME()
  WHERE [Id]=@Id AND [SourceSystem]<>@ManualSource;

  INSERT INTO [hris].[OrganizationJobTitles]
    ([Id],[SourceSystem],[Code],[Title],[Family],[TitleLevel],[GradeCode],[GradeName],[ReportingLevel],[BenchmarkSalaryNgn],[EmployeeCount],[OpenPositions],[DepartmentCount],[LocationCount],[SuccessionCoveragePct],[AttritionRiskPct],[InternalMobilityPct],[HealthStatus],[StandardizationStatus],[BenchmarkPosition],[JobPurpose],[CommonLocationsJson],[DepartmentsJson],[KeyResponsibilitiesJson],[SourceSnapshotJson])
  SELECT
    @Id,@SourceSystem,@Code,@Title,@Family,@TitleLevel,@GradeCode,@GradeName,@ReportingLevel,@BenchmarkSalaryNgn,@EmployeeCount,@OpenPositions,@DepartmentCount,@LocationCount,@SuccessionCoveragePct,@AttritionRiskPct,@InternalMobilityPct,@HealthStatus,@StandardizationStatus,@BenchmarkPosition,@JobPurpose,@CommonLocationsJson,@DepartmentsJson,@KeyResponsibilitiesJson,@SourceSnapshotJson
  WHERE NOT EXISTS (SELECT 1 FROM [hris].[OrganizationJobTitles] WHERE [Id]=@Id);
END`);
    }
    await tx.commit();
  } catch (error) {
    await tx.rollback().catch(() => undefined);
    throw error;
  }
  return { source, titles };
};

const readJobTitles = async () => {
  const pool = await ensureDb();
  const result = await pool.request().query(`
SELECT [Id],[Code],[Title],[Family],[TitleLevel],[GradeCode],[GradeName],[ReportingLevel],[BenchmarkSalaryNgn],[EmployeeCount],[OpenPositions],
  [DepartmentCount],[LocationCount],[SuccessionCoveragePct],[AttritionRiskPct],[InternalMobilityPct],[HealthStatus],[StandardizationStatus],
  [BenchmarkPosition],[JobPurpose],[CommonLocationsJson],[DepartmentsJson],[KeyResponsibilitiesJson]
FROM [hris].[OrganizationJobTitles]
ORDER BY [EmployeeCount] DESC, [Title];`);
  return (result.recordset as DbJobTitleRow[]).map(rowToTitle);
};

export type OrganizationJobTitleOption = {
  label: string;
  code: string;
  title: string;
  grade: string;
};

export const listOrganizationJobTitleOptions = async (): Promise<OrganizationJobTitleOption[]> => {
  const titles = await readJobTitles();
  const seen = new Set<string>();
  const options: OrganizationJobTitleOption[] = [];
  for (const title of titles) {
    const label = formatOrganizationJobTitleLabel(title.code, title.title);
    const key = label.toLowerCase();
    if (!label || seen.has(key)) continue;
    seen.add(key);
    options.push({
      label,
      code: title.code,
      title: title.title,
      grade: title.gradeName || title.gradeCode,
    });
  }
  return options.sort((a, b) => a.label.localeCompare(b.label));
};

const avg = (values: number[]) => values.length ? round1(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;

const buildPayload = (titles: JobTitleRecord[], dataSource: JobTitlesPayload['dataSource']): JobTitlesPayload => {
  const mostPressuredTitle = [...titles].sort((a, b) => b.attritionRiskPct - a.attritionRiskPct || b.employeeCount - a.employeeCount)[0];
  const reviewTitle = titles.find((title) => title.standardizationStatus === 'Needs Review') || titles.find((title) => title.standardizationStatus === 'Variant');
  const largestTitle = [...titles].sort((a, b) => b.employeeCount - a.employeeCount)[0];
  const insights: StructureInsight[] = [
    dataSource.migrationWarning ? {
      id: 'title-source-warning',
      severity: 'high',
      title: 'Job title migration requires attention',
      recommendation: dataSource.migrationWarning,
    } : null,
    reviewTitle ? {
      id: 'title-review',
      severity: reviewTitle.standardizationStatus === 'Needs Review' ? 'high' : 'medium',
      title: `${reviewTitle.title} needs title architecture review`,
      recommendation: 'Confirm job title code, grade alignment, and naming standard before using this title for recruitment or workflow routing.',
    } : null,
    mostPressuredTitle ? {
      id: 'title-pressure',
      severity: mostPressuredTitle.healthStatus === 'Critical' ? 'high' : 'medium',
      title: `${mostPressuredTitle.title} has the highest title risk`,
      recommendation: 'Review reporting coverage, payroll completeness, title variants, and succession readiness for this role.',
    } : null,
    largestTitle ? {
      id: 'title-concentration',
      severity: largestTitle.employeeCount > 100 ? 'medium' : 'low',
      title: `${largestTitle.title} carries the largest workforce concentration`,
      recommendation: 'Use this title as a control point for manpower planning, grade drift, payroll setup, and training requirements.',
    } : null,
  ].filter((item): item is StructureInsight => Boolean(item));

  return {
    generatedAt: new Date().toISOString(),
    permissions: {
      canEdit: true,
      canExport: true,
      canViewCosts: true,
    },
    dataSource,
    summary: {
      totalTitles: titles.length,
      totalEmployees: titles.reduce((sum, title) => sum + title.employeeCount, 0),
      totalOpenPositions: titles.reduce((sum, title) => sum + title.openPositions, 0),
      avgSuccessionCoverage: avg(titles.map((title) => title.successionCoveragePct)),
      avgAttritionRisk: avg(titles.map((title) => title.attritionRiskPct)),
      avgInternalMobility: avg(titles.map((title) => title.internalMobilityPct)),
      titlesNeedingReview: titles.filter((title) => title.standardizationStatus === 'Needs Review').length,
      titleVariants: titles.filter((title) => title.standardizationStatus === 'Variant').length,
    },
    filterOptions: {
      families: uniqueSorted(titles.map((title) => title.family)),
      levels: uniqueSorted(titles.map((title) => title.level)),
      grades: uniqueSorted(titles.map((title) => title.gradeCode)),
      reportingLevels: uniqueSorted(titles.map((title) => title.reportingLevel)),
      standardizationStatuses: uniqueSorted(titles.map((title) => title.standardizationStatus)),
      healthStatuses: ['Healthy', 'Needs Attention', 'Critical'],
    },
    titles,
    insights,
  };
};

export const readLiveJobTitles = async (): Promise<JobTitlesPayload> => {
  let migrationWarning: string | null = null;
  let sourceInfo: ReturnType<typeof payrollDataSourceInfo> | null = null;
  try {
    const synced = await syncSageJobTitles();
    sourceInfo = payrollDataSourceInfo(synced.source);
  } catch (error) {
    migrationWarning = error instanceof Error ? error.message : 'Unable to sync Sage-migrated job titles into HRIS.';
  }
  const titles = await readJobTitles();
  return buildPayload(titles, {
    ...(sourceInfo || { source: 'DLE_Enterprise HRIS', databaseAvailable: true, warning: null, employeeCount: titles.reduce((sum, title) => sum + title.employeeCount, 0) }),
    structureSource: sourceInfo?.databaseAvailable ? SOURCE_SYSTEM : 'DLE Enterprise HRIS',
    migratedTitleCount: titles.length,
    migrationWarning,
    independence: 'Job titles are stored in the DLE HRIS database after migration and do not depend on live Sage reads for normal page rendering.',
  });
};

const FAMILIES = ['Executive', 'Management', 'Professional', 'Technical', 'Operations Support'] as const;
const LEVELS = ['Strategic', 'Senior', 'Mid', 'Entry'] as const;
const REPORTING_LEVELS = ['Enterprise', 'Division', 'Department', 'Team'] as const;
const STANDARDIZATION = ['Standard', 'Variant', 'Needs Review'] as const;
const HEALTH = ['Healthy', 'Needs Attention', 'Critical'] as const;

export class JobTitleInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JobTitleInputError';
  }
}

export type JobTitleWriteInput = {
  code?: unknown;
  title?: unknown;
  grade?: unknown;
  gradeCode?: unknown;
  gradeName?: unknown;
  family?: unknown;
  level?: unknown;
  reportingLevel?: unknown;
  standardizationStatus?: unknown;
  healthStatus?: unknown;
  openPositions?: unknown;
  benchmarkPosition?: unknown;
  jobPurpose?: unknown;
  keyResponsibilities?: unknown;
};

export type NormalizedJobTitleWrite = {
  code: string;
  title: string;
  gradeCode: string;
  gradeName: string;
  family: JobTitleRecord['family'];
  level: JobTitleRecord['level'];
  reportingLevel: JobTitleRecord['reportingLevel'];
  standardizationStatus: JobTitleRecord['standardizationStatus'];
  healthStatus: HealthStatus;
  openPositions: number;
  benchmarkPosition: string;
  jobPurpose: string;
  keyResponsibilities: string[];
};

const choice = <T extends string>(value: unknown, options: readonly T[], label: string, fallback: T): T => {
  const text = clean(typeof value === 'string' ? value : '');
  if (!text) return fallback;
  const match = options.find((option) => option.toLowerCase() === text.toLowerCase());
  if (!match) throw new JobTitleInputError(`A valid ${label} is required.`);
  return match;
};

const responsibilityList = (value: unknown) => {
  const rows = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/\r?\n/) : [];
  return rows.map((item) => clip(typeof item === 'string' ? item : '', 180)).filter(Boolean).slice(0, 12);
};

export const normalizeJobTitleWrite = (input: JobTitleWriteInput): NormalizedJobTitleWrite => {
  const code = clip(clean(typeof input.code === 'string' ? input.code : '').toUpperCase(), 80);
  const title = clip(clean(typeof input.title === 'string' ? input.title : '').replace(/\s+/g, ' '), 180);
  if (!code) throw new JobTitleInputError('Job title code is required.');
  if (!title) throw new JobTitleInputError('Job title name is required.');
  const gradeSource = clean(typeof input.grade === 'string' ? input.grade : '')
    || clean(typeof input.gradeName === 'string' ? input.gradeName : '')
    || clean(typeof input.gradeCode === 'string' ? input.gradeCode : '');
  if (!gradeSource) throw new JobTitleInputError('Grade is required.');
  const family = choice(input.family, FAMILIES, 'job family', 'Professional');
  const level = choice(input.level, LEVELS, 'job level', 'Mid');
  const reportingLevel = choice(input.reportingLevel, REPORTING_LEVELS, 'reporting level', 'Team');
  const standardizationStatus = choice(input.standardizationStatus, STANDARDIZATION, 'standardization status', 'Standard');
  const healthFallback: HealthStatus = standardizationStatus === 'Needs Review' ? 'Critical' : standardizationStatus === 'Variant' ? 'Needs Attention' : 'Healthy';
  const healthStatus = choice(input.healthStatus, HEALTH, 'health status', healthFallback);
  const openRaw = input.openPositions;
  const openPositions = openRaw === undefined || openRaw === null || openRaw === '' ? 0 : Number(openRaw);
  if (!Number.isInteger(openPositions) || openPositions < 0 || openPositions > 100000) {
    throw new JobTitleInputError('Open roles must be a whole number of 0 or more.');
  }
  const benchmarkPosition = clip(clean(typeof input.benchmarkPosition === 'string' ? input.benchmarkPosition : '') || title, 180);
  const jobPurpose = clip(
    clean(typeof input.jobPurpose === 'string' ? input.jobPurpose : '') || `${title} is a standardized HRIS job title in the ${family} family.`,
    800,
  );
  const provided = responsibilityList(input.keyResponsibilities);
  return {
    code,
    title,
    gradeCode: clip(gradeSource, 80),
    gradeName: clip(gradeSource, 180),
    family,
    level,
    reportingLevel,
    standardizationStatus,
    healthStatus,
    openPositions,
    benchmarkPosition,
    jobPurpose,
    keyResponsibilities: provided.length ? provided : responsibilitiesFor(title, family),
  };
};

const assertUniqueCodeTitle = async (code: string, title: string, ignoreId = '') => {
  const pool = await ensureDb();
  const existing = await pool.request()
    .input('Code', sql.NVarChar(80), code)
    .input('Title', sql.NVarChar(180), title)
    .input('Id', sql.NVarChar(180), ignoreId)
    .query(`SELECT TOP 1 [Id] FROM [hris].[OrganizationJobTitles] WHERE [Code]=@Code AND [Title]=@Title AND [Id]<>@Id`);
  if (existing.recordset?.length) throw new JobTitleInputError(`Job title ${code} · ${title} already exists.`);
  return pool;
};

const snapshotJson = (action: 'created' | 'edited', previousSource?: string) => JSON.stringify({
  managedBy: MANUAL_SOURCE,
  action,
  at: new Date().toISOString(),
  previousSource: previousSource || null,
});

export const createJobTitle = async (input: JobTitleWriteInput): Promise<JobTitleRecord> => {
  const title = normalizeJobTitleWrite(input);
  const pool = await assertUniqueCodeTitle(title.code, title.title);
  let id = jobTitleId(slug(title.code), slug(title.title));
  const idTaken = await pool.request()
    .input('Id', sql.NVarChar(180), id)
    .query(`SELECT TOP 1 [Id] FROM [hris].[OrganizationJobTitles] WHERE [Id]=@Id`);
  if (idTaken.recordset?.length) id = clip(`${id}-hris-${Date.now().toString(36)}`, 180);
  const record: JobTitleRecord = {
    id,
    code: title.code,
    title: title.title,
    family: title.family,
    level: title.level,
    gradeCode: title.gradeCode,
    gradeName: title.gradeName,
    reportingLevel: title.reportingLevel,
    benchmarkSalaryNgn: 0,
    employeeCount: 0,
    openPositions: title.openPositions,
    departmentCount: 0,
    locationCount: 0,
    successionCoveragePct: 0,
    attritionRiskPct: 0,
    internalMobilityPct: 0,
    healthStatus: title.healthStatus,
    standardizationStatus: title.standardizationStatus,
    benchmarkPosition: title.benchmarkPosition,
    jobPurpose: title.jobPurpose,
    commonLocations: [],
    departments: [],
    keyResponsibilities: title.keyResponsibilities,
  };
  await pool.request()
    .input('Id', sql.NVarChar(180), record.id)
    .input('SourceSystem', sql.NVarChar(80), MANUAL_SOURCE)
    .input('Code', sql.NVarChar(80), record.code)
    .input('Title', sql.NVarChar(180), record.title)
    .input('Family', sql.NVarChar(40), record.family)
    .input('TitleLevel', sql.NVarChar(40), record.level)
    .input('GradeCode', sql.NVarChar(80), record.gradeCode)
    .input('GradeName', sql.NVarChar(180), record.gradeName)
    .input('ReportingLevel', sql.NVarChar(40), record.reportingLevel)
    .input('BenchmarkSalaryNgn', sql.Decimal(19, 2), record.benchmarkSalaryNgn)
    .input('EmployeeCount', sql.Int, record.employeeCount)
    .input('OpenPositions', sql.Int, record.openPositions)
    .input('DepartmentCount', sql.Int, record.departmentCount)
    .input('LocationCount', sql.Int, record.locationCount)
    .input('SuccessionCoveragePct', sql.Decimal(9, 2), record.successionCoveragePct)
    .input('AttritionRiskPct', sql.Decimal(9, 2), record.attritionRiskPct)
    .input('InternalMobilityPct', sql.Decimal(9, 2), record.internalMobilityPct)
    .input('HealthStatus', sql.NVarChar(40), record.healthStatus)
    .input('StandardizationStatus', sql.NVarChar(40), record.standardizationStatus)
    .input('BenchmarkPosition', sql.NVarChar(180), record.benchmarkPosition)
    .input('JobPurpose', sql.NVarChar(800), record.jobPurpose)
    .input('CommonLocationsJson', sql.NVarChar(sql.MAX), '[]')
    .input('DepartmentsJson', sql.NVarChar(sql.MAX), '[]')
    .input('KeyResponsibilitiesJson', sql.NVarChar(sql.MAX), JSON.stringify(record.keyResponsibilities))
    .input('SourceSnapshotJson', sql.NVarChar(sql.MAX), snapshotJson('created'))
    .query(`
INSERT INTO [hris].[OrganizationJobTitles]
  ([Id],[SourceSystem],[Code],[Title],[Family],[TitleLevel],[GradeCode],[GradeName],[ReportingLevel],[BenchmarkSalaryNgn],[EmployeeCount],[OpenPositions],[DepartmentCount],[LocationCount],[SuccessionCoveragePct],[AttritionRiskPct],[InternalMobilityPct],[HealthStatus],[StandardizationStatus],[BenchmarkPosition],[JobPurpose],[CommonLocationsJson],[DepartmentsJson],[KeyResponsibilitiesJson],[SourceSnapshotJson])
VALUES
  (@Id,@SourceSystem,@Code,@Title,@Family,@TitleLevel,@GradeCode,@GradeName,@ReportingLevel,@BenchmarkSalaryNgn,@EmployeeCount,@OpenPositions,@DepartmentCount,@LocationCount,@SuccessionCoveragePct,@AttritionRiskPct,@InternalMobilityPct,@HealthStatus,@StandardizationStatus,@BenchmarkPosition,@JobPurpose,@CommonLocationsJson,@DepartmentsJson,@KeyResponsibilitiesJson,@SourceSnapshotJson);`);
  return record;
};

export const updateJobTitle = async (id: string, input: JobTitleWriteInput): Promise<JobTitleRecord> => {
  const titleId = clip(clean(id), 180);
  if (!titleId) throw new JobTitleInputError('Job title id is required.');
  const title = normalizeJobTitleWrite(input);
  const pool = await assertUniqueCodeTitle(title.code, title.title, titleId);
  const current = await pool.request()
    .input('Id', sql.NVarChar(180), titleId)
    .query(`
SELECT [Id],[SourceSystem],[Code],[Title],[Family],[TitleLevel],[GradeCode],[GradeName],[ReportingLevel],[BenchmarkSalaryNgn],[EmployeeCount],[OpenPositions],
  [DepartmentCount],[LocationCount],[SuccessionCoveragePct],[AttritionRiskPct],[InternalMobilityPct],[HealthStatus],[StandardizationStatus],
  [BenchmarkPosition],[JobPurpose],[CommonLocationsJson],[DepartmentsJson],[KeyResponsibilitiesJson]
FROM [hris].[OrganizationJobTitles]
WHERE [Id]=@Id`);
  const row = current.recordset?.[0] as (DbJobTitleRow & { SourceSystem?: string }) | undefined;
  if (!row) throw new JobTitleInputError('Job title was not found.');
  const record: JobTitleRecord = {
    ...rowToTitle(row),
    code: title.code,
    title: title.title,
    family: title.family,
    level: title.level,
    gradeCode: title.gradeCode,
    gradeName: title.gradeName,
    reportingLevel: title.reportingLevel,
    openPositions: title.openPositions,
    healthStatus: title.healthStatus,
    standardizationStatus: title.standardizationStatus,
    benchmarkPosition: title.benchmarkPosition,
    jobPurpose: title.jobPurpose,
    keyResponsibilities: title.keyResponsibilities,
  };
  await pool.request()
    .input('Id', sql.NVarChar(180), record.id)
    .input('SourceSystem', sql.NVarChar(80), MANUAL_SOURCE)
    .input('Code', sql.NVarChar(80), record.code)
    .input('Title', sql.NVarChar(180), record.title)
    .input('Family', sql.NVarChar(40), record.family)
    .input('TitleLevel', sql.NVarChar(40), record.level)
    .input('GradeCode', sql.NVarChar(80), record.gradeCode)
    .input('GradeName', sql.NVarChar(180), record.gradeName)
    .input('ReportingLevel', sql.NVarChar(40), record.reportingLevel)
    .input('OpenPositions', sql.Int, record.openPositions)
    .input('HealthStatus', sql.NVarChar(40), record.healthStatus)
    .input('StandardizationStatus', sql.NVarChar(40), record.standardizationStatus)
    .input('BenchmarkPosition', sql.NVarChar(180), record.benchmarkPosition)
    .input('JobPurpose', sql.NVarChar(800), record.jobPurpose)
    .input('KeyResponsibilitiesJson', sql.NVarChar(sql.MAX), JSON.stringify(record.keyResponsibilities))
    .input('SourceSnapshotJson', sql.NVarChar(sql.MAX), snapshotJson('edited', clean(row.SourceSystem)))
    .query(`
UPDATE [hris].[OrganizationJobTitles] SET
  [SourceSystem]=@SourceSystem,[Code]=@Code,[Title]=@Title,[Family]=@Family,[TitleLevel]=@TitleLevel,[GradeCode]=@GradeCode,[GradeName]=@GradeName,
  [ReportingLevel]=@ReportingLevel,[OpenPositions]=@OpenPositions,[HealthStatus]=@HealthStatus,[StandardizationStatus]=@StandardizationStatus,
  [BenchmarkPosition]=@BenchmarkPosition,[JobPurpose]=@JobPurpose,[KeyResponsibilitiesJson]=@KeyResponsibilitiesJson,
  [SourceSnapshotJson]=@SourceSnapshotJson,[LastSyncedAt]=SYSUTCDATETIME()
WHERE [Id]=@Id`);
  return record;
};
