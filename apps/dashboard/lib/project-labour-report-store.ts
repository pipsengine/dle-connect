import sql from 'mssql';
import { readDelimitedRows, readFirstSheetRows } from '@/lib/crew-mobilization-upload';
import { getDleEnterpriseDbPool } from '@/lib/dle-enterprise-db';
import { buildSimpleWorkbook } from '@/lib/project-labour-export';
import {
  MANUAL_RATE_MARKER,
  employerOnCostPercent,
  isManualRateNote,
  type OnCostBasis,
  parseRateSheet,
  payrollSeedRate,
  rateSheetRows,
  sameRate,
  type LabourRateInput,
  type RateSheetEmployee,
} from '@/lib/project-labour-rate-sources';
import {
  approvalLabelFor,
  buildLabourReport,
  canViewProjectLabourReport,
  dayKindForDate,
  type LabourAdjustment,
  type LabourBudget,
  type LabourRateCard,
  type LabourReport,
  type LabourSourceLine,
  type LockedLabourSnapshot,
  type PmState,
} from '@/lib/project-labour-cost';

export type LabourViewer = {
  actor: string;
  employeeCode: string;
  roles: string;
  department?: string;
  unit?: string;
  globalAdmin: boolean;
};

export type LabourFilters = {
  periodId?: string;
  from?: string;
  to?: string;
  project?: string;
  projectManager?: string;
  department?: string;
  supervisor?: string;
  location?: string;
  workCenter?: string;
  employee?: string;
  employeeType?: string;
  approval?: string;
  category?: string;
  groupBy?: string;
  projectPage?: number;
  linePage?: number;
  pageSize?: number;
};

const text = (value: unknown) => String(value ?? '').trim();
const dateOnly = (value: unknown) => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const raw = text(value);
  return /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : '';
};
const num = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const naira = (kobo: number | null | undefined) => (kobo == null ? null : Math.round(kobo) / 100);
const newId = () => `lbc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export const labourAccess = (viewer: LabourViewer) => {
  const roles = viewer.roles || '';
  const admin = viewer.globalAdmin || /super administrator/i.test(roles);
  const finance = admin || /finance|cfo|cost control|accountant/i.test(roles);
  const hr = admin || /human resource|\bhr\b|payroll/i.test(roles);
  const projectManager = /project manager/i.test(roles);
  return {
    canSeeCosts: admin || finance || hr || projectManager,
    canSeeRates: admin || finance || hr,
    canManageRates: admin || finance || hr,
    canAdjust: admin || finance,
    canSetBudget: admin || finance,
    restrictToOwnProjects: projectManager && !admin && !finance && !hr,
  };
};

let ensured = false;

const ensure = async (pool: sql.ConnectionPool) => {
  if (ensured) return;
  await pool.request().query(`
IF SCHEMA_ID(N'tsmgmt') IS NULL EXEC(N'CREATE SCHEMA [tsmgmt]');
IF OBJECT_ID(N'[tsmgmt].[LabourCostRates]', N'U') IS NULL
CREATE TABLE [tsmgmt].[LabourCostRates] (
  [Id] NVARCHAR(40) NOT NULL CONSTRAINT [PK_TsmgmtLabourCostRates] PRIMARY KEY,
  [EmployeeCode] NVARCHAR(80) NOT NULL,
  [Method] NVARCHAR(20) NOT NULL,
  [Currency] NVARCHAR(8) NOT NULL CONSTRAINT [DF_TsmgmtLabourRates_Currency] DEFAULT N'NGN',
  [Amount] DECIMAL(19,4) NOT NULL,
  [ExchangeRate] DECIMAL(18,8) NULL,
  [ExchangeRateVersion] NVARCHAR(40) NULL,
  [RateVersion] NVARCHAR(40) NOT NULL,
  [EffectiveFrom] DATE NOT NULL,
  [EffectiveTo] DATE NULL,
  [WorkingDays] DECIMAL(9,2) NULL,
  [StandardHours] DECIMAL(9,2) NOT NULL CONSTRAINT [DF_TsmgmtLabourRates_Hours] DEFAULT 8,
  [WeekdayOvtMultiplier] DECIMAL(9,4) NULL,
  [SaturdayMultiplier] DECIMAL(9,4) NULL,
  [SaturdayOvtMultiplier] DECIMAL(9,4) NULL,
  [SundayMultiplier] DECIMAL(9,4) NULL,
  [SundayOvtMultiplier] DECIMAL(9,4) NULL,
  [PhMultiplier] DECIMAL(9,4) NULL,
  [PhOvtMultiplier] DECIMAL(9,4) NULL,
  [NightMultiplier] DECIMAL(9,4) NULL,
  [NightAllowance] DECIMAL(19,2) NULL,
  [OffshoreAllowance] DECIMAL(19,2) NULL,
  [Notes] NVARCHAR(400) NULL,
  [CreatedBy] NVARCHAR(120) NULL,
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_TsmgmtLabourRates_Created] DEFAULT SYSUTCDATETIME()
);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_TsmgmtLabourRates_Employee' AND object_id = OBJECT_ID(N'[tsmgmt].[LabourCostRates]'))
CREATE INDEX [IX_TsmgmtLabourRates_Employee] ON [tsmgmt].[LabourCostRates]([EmployeeCode], [EffectiveFrom]);
IF OBJECT_ID(N'[tsmgmt].[LabourCostSnapshots]', N'U') IS NULL
CREATE TABLE [tsmgmt].[LabourCostSnapshots] (
  [AllocationId] NVARCHAR(40) NOT NULL CONSTRAINT [PK_TsmgmtLabourSnapshots] PRIMARY KEY,
  [TimesheetId] NVARCHAR(40) NOT NULL,
  [EmployeeCode] NVARCHAR(80) NOT NULL,
  [ProjectCode] NVARCHAR(80) NOT NULL,
  [WorkDate] DATE NOT NULL,
  [RegularHours] DECIMAL(9,2) NOT NULL,
  [OvtHours] DECIMAL(9,2) NOT NULL,
  [NightSession] BIT NOT NULL,
  [RegularCost] DECIMAL(19,2) NULL,
  [OvtCost] DECIMAL(19,2) NULL,
  [NightLabour] DECIMAL(19,2) NULL,
  [NightAllowance] DECIMAL(19,2) NULL,
  [OtherAllowance] DECIMAL(19,2) NULL,
  [TotalCost] DECIMAL(19,2) NULL,
  [RateVersion] NVARCHAR(40) NULL,
  [Method] NVARCHAR(20) NULL,
  [PayrollStatus] NVARCHAR(40) NULL,
  [LockedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_TsmgmtLabourSnapshots_Locked] DEFAULT SYSUTCDATETIME()
);
IF OBJECT_ID(N'[tsmgmt].[LabourCostAdjustments]', N'U') IS NULL
CREATE TABLE [tsmgmt].[LabourCostAdjustments] (
  [Id] NVARCHAR(40) NOT NULL CONSTRAINT [PK_TsmgmtLabourAdjustments] PRIMARY KEY,
  [AllocationId] NVARCHAR(40) NOT NULL,
  [ProjectCode] NVARCHAR(80) NOT NULL,
  [EmployeeCode] NVARCHAR(80) NOT NULL,
  [WorkDate] DATE NOT NULL,
  [Component] NVARCHAR(40) NOT NULL,
  [OriginalAmount] DECIMAL(19,2) NOT NULL,
  [CorrectedAmount] DECIMAL(19,2) NOT NULL,
  [Reason] NVARCHAR(500) NOT NULL,
  [RequestedBy] NVARCHAR(120) NOT NULL,
  [ApprovedBy] NVARCHAR(120) NOT NULL,
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_TsmgmtLabourAdjustments_Created] DEFAULT SYSUTCDATETIME()
);
IF OBJECT_ID(N'[tsmgmt].[ProjectLabourBudgets]', N'U') IS NULL
CREATE TABLE [tsmgmt].[ProjectLabourBudgets] (
  [ProjectCode] NVARCHAR(80) NOT NULL CONSTRAINT [PK_TsmgmtProjectLabourBudgets] PRIMARY KEY,
  [LabourBudget] DECIMAL(19,2) NOT NULL,
  [Notes] NVARCHAR(400) NULL,
  [UpdatedBy] NVARCHAR(120) NULL,
  [UpdatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_TsmgmtProjectLabourBudgets_Updated] DEFAULT SYSUTCDATETIME()
);
IF OBJECT_ID(N'[tsmgmt].[LabourReportAudit]', N'U') IS NULL
CREATE TABLE [tsmgmt].[LabourReportAudit] (
  [Id] NVARCHAR(40) NOT NULL CONSTRAINT [PK_TsmgmtLabourReportAudit] PRIMARY KEY,
  [Actor] NVARCHAR(120) NOT NULL,
  [FiltersJson] NVARCHAR(MAX) NOT NULL,
  [ApprovedTotal] DECIMAL(19,2) NULL,
  [ProvisionalTotal] DECIMAL(19,2) NULL,
  [LineCount] INT NOT NULL,
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_TsmgmtLabourReportAudit_Created] DEFAULT SYSUTCDATETIME()
);
`);
  ensured = true;
};

const pool = async () => {
  const connection = await getDleEnterpriseDbPool();
  if (!connection) throw new Error('DLE Enterprise database is not configured.');
  await ensure(connection);
  return connection;
};

const optionalRows = async (work: () => Promise<unknown>) => {
  try {
    const result = await work() as { recordset?: Array<Record<string, unknown>> };
    return { recordset: result.recordset || [] };
  } catch {
    return { recordset: [] as Array<Record<string, unknown>> };
  }
};

export const readProjectLabourReport = async (filters: LabourFilters, viewer: LabourViewer) => {
  if (!canViewProjectLabourReport(viewer)) throw new Error('You do not have permission to open Project Man-Hours & Labour Cost.');
  const connection = await pool();
  const access = { ...labourAccess(viewer), canSeeCosts: true };
  const periods = await connection.request().query(`SELECT [Id], [Name], [StartDate], [EndDate], [Status] FROM [tsmgmt].[Periods] ORDER BY [StartDate] DESC`);
  const periodRows = (periods.recordset || []).map((row) => ({
    id: text(row.Id),
    name: text(row.Name),
    startDate: dateOnly(row.StartDate),
    endDate: dateOnly(row.EndDate),
    status: text(row.Status),
  }));
  const selected = periodRows.find((period) => period.id === filters.periodId) || periodRows.find((period) => period.status === 'Open') || periodRows[0];
  const from = dateOnly(filters.from) || selected?.startDate || '';
  const to = dateOnly(filters.to) || selected?.endDate || '';
  if (!from || !to) throw new Error('Choose a timesheet period or a date range.');

  const holidays = await optionalRows(() => connection.request().query(`
    SELECT CONVERT(varchar(10), [HolidayDate], 23) AS HolidayDate
    FROM [tsmgmt].[PublicHolidays]
    WHERE [Status] = N'Active' AND ISNULL([TimesheetApplicable], 1) = 1
  `));
  const holidayDates = (holidays.recordset || []).map((row) => dateOnly(row.HolidayDate)).filter(Boolean);

  const source = await connection.request()
    .input('From', sql.Date, from)
    .input('To', sql.Date, to)
    .query(`
      SELECT a.[Id] AS AllocationId, a.[ProjectCode], a.[ProjectName], a.[RegularHours], a.[OvtHours], a.[Activity], a.[ChargeCode],
        l.[EmployeeCode], l.[EmployeeName], l.[LocationName], l.[WorkCenterName], l.[AttendanceStatus], l.[NightSession],
        t.[Id] AS TimesheetId, t.[ReferenceCode], t.[PeriodId], t.[WorkDate], t.[SupervisorName], t.[ShiftLabel], t.[Status], t.[DayKind],
        v.department, v.employment_type,
        s.[RegularHours] AS SnapRegular, s.[OvtHours] AS SnapOvt, s.[NightSession] AS SnapNight,
        s.[RegularCost], s.[OvtCost], s.[NightLabour], s.[NightAllowance] AS SnapAllowance, s.[OtherAllowance], s.[TotalCost], s.[RateVersion] AS SnapRate, s.[Method] AS SnapMethod
      FROM [tsmgmt].[TimesheetAllocations] a
      INNER JOIN [tsmgmt].[TimesheetEntryLines] l ON l.[Id] = a.[LineId]
      INNER JOIN [tsmgmt].[Timesheets] t ON t.[Id] = l.[TimesheetId]
      OUTER APPLY (
        SELECT TOP 1 v.department, v.employment_type
        FROM [hris].[EmployeeMasterView] v
        WHERE v.employee_code = l.[EmployeeCode]
      ) v
      LEFT JOIN [tsmgmt].[LabourCostSnapshots] s ON s.[AllocationId] = a.[Id]
      WHERE t.[WorkDate] >= @From AND t.[WorkDate] <= @To
        AND (ISNULL(a.[RegularHours], 0) > 0 OR ISNULL(a.[OvtHours], 0) > 0 OR ISNULL(l.[NightSession], 0) = 1)
    `);

  const pmRows = await optionalRows(() => connection.request().query(`
    SELECT [ProjectCode], [ProjectName], [ProjectManagerName], [ProjectManagerEmployeeCode]
    FROM [pm].[Projects]
    WHERE ISNULL([IsDeleted], 0) = 0
  `));
  const managers = new Map<string, { name: string; code: string; projectName: string }>();
  for (const row of pmRows.recordset || []) {
    managers.set(text(row.ProjectCode).toUpperCase(), {
      name: text(row.ProjectManagerName),
      code: text(row.ProjectManagerEmployeeCode),
      projectName: text(row.ProjectName),
    });
  }

  const approval = await optionalRows(() => connection.request()
    .input('From', sql.Date, from)
    .input('To', sql.Date, to)
    .query(`
      SELECT [TimesheetId], [ProjectCode],
        SUM(CASE WHEN [Status] = N'Approved' THEN 1 ELSE 0 END) AS ApprovedCount,
        SUM(CASE WHEN [Status] = N'Pending' THEN 1 ELSE 0 END) AS PendingCount
      FROM [tsmgmt].[ApprovalItems]
      WHERE [Stage] = N'Project Manager' AND [Status] <> N'Superseded' AND [WorkDate] >= @From AND [WorkDate] <= @To
      GROUP BY [TimesheetId], [ProjectCode]
    `));
  const pmState = new Map<string, PmState>();
  for (const row of approval.recordset || []) {
    const approvedCount = num(row.ApprovedCount);
    const pendingCount = num(row.PendingCount);
    const state: PmState = pendingCount > 0 && approvedCount > 0 ? 'partial' : pendingCount > 0 ? 'pending' : approvedCount > 0 ? 'approved' : 'none';
    pmState.set(`${text(row.TimesheetId)}|${text(row.ProjectCode).toUpperCase()}`, state);
  }

  const rateRows = await connection.request().query(`SELECT * FROM [tsmgmt].[LabourCostRates]`);
  const rates: LabourRateCard[] = (rateRows.recordset || []).map((row) => ({
    employeeCode: text(row.EmployeeCode),
    method: text(row.Method).toLowerCase() as LabourRateCard['method'],
    rateVersion: text(row.RateVersion),
    effectiveFrom: dateOnly(row.EffectiveFrom),
    effectiveTo: dateOnly(row.EffectiveTo),
    currency: text(row.Currency) || 'NGN',
    amount: num(row.Amount),
    exchangeRate: row.ExchangeRate == null ? null : num(row.ExchangeRate),
    exchangeRateVersion: text(row.ExchangeRateVersion),
    workingDays: row.WorkingDays == null ? null : num(row.WorkingDays),
    standardHours: num(row.StandardHours) || 8,
    multipliers: {
      weekdayOvt: row.WeekdayOvtMultiplier == null ? undefined : num(row.WeekdayOvtMultiplier),
      saturday: row.SaturdayMultiplier == null ? undefined : num(row.SaturdayMultiplier),
      saturdayOvt: row.SaturdayOvtMultiplier == null ? undefined : num(row.SaturdayOvtMultiplier),
      sunday: row.SundayMultiplier == null ? undefined : num(row.SundayMultiplier),
      sundayOvt: row.SundayOvtMultiplier == null ? undefined : num(row.SundayOvtMultiplier),
      publicHoliday: row.PhMultiplier == null ? undefined : num(row.PhMultiplier),
      publicHolidayOvt: row.PhOvtMultiplier == null ? undefined : num(row.PhOvtMultiplier),
      night: row.NightMultiplier == null ? undefined : num(row.NightMultiplier),
    },
    nightAllowance: row.NightAllowance == null ? null : num(row.NightAllowance),
    offshoreAllowance: row.OffshoreAllowance == null ? null : num(row.OffshoreAllowance),
  }));

  const budgetRows = await connection.request().query(`SELECT [ProjectCode], [LabourBudget] FROM [tsmgmt].[ProjectLabourBudgets]`);
  const plannedRows = await optionalRows(() => connection.request().query(`SELECT [ProjectCode], [BudgetedHours] FROM [pm].[ManHourBudgets]`));
  const planned = new Map((plannedRows.recordset || []).map((row) => [text(row.ProjectCode).toUpperCase(), num(row.BudgetedHours)]));
  const budgets: LabourBudget[] = (budgetRows.recordset || []).map((row) => {
    const code = text(row.ProjectCode).toUpperCase();
    return { projectCode: code, labourBudgetKobo: Math.round(num(row.LabourBudget) * 100), plannedHours: planned.has(code) ? planned.get(code) || 0 : null };
  });
  for (const [code, hours] of planned) {
    if (!budgets.some((budget) => budget.projectCode === code)) budgets.push({ projectCode: code, labourBudgetKobo: null, plannedHours: hours });
  }

  const adjustmentRows = await connection.request()
    .input('From', sql.Date, from)
    .input('To', sql.Date, to)
    .query(`SELECT * FROM [tsmgmt].[LabourCostAdjustments] WHERE [WorkDate] >= @From AND [WorkDate] <= @To`);
  const adjustments: LabourAdjustment[] = (adjustmentRows.recordset || []).map((row) => ({
    id: text(row.Id),
    allocationId: text(row.AllocationId),
    projectCode: text(row.ProjectCode),
    employeeCode: text(row.EmployeeCode),
    workDate: dateOnly(row.WorkDate),
    component: text(row.Component),
    originalKobo: Math.round(num(row.OriginalAmount) * 100),
    correctedKobo: Math.round(num(row.CorrectedAmount) * 100),
    reason: text(row.Reason),
    requestedBy: text(row.RequestedBy),
    approvedBy: text(row.ApprovedBy),
    at: row.CreatedAt ? new Date(String(row.CreatedAt)).toISOString() : '',
  }));

  const lines: LabourSourceLine[] = [];
  const locked: LockedLabourSnapshot[] = [];
  for (const row of source.recordset || []) {
    const projectCode = text(row.ProjectCode).toUpperCase();
    const manager = managers.get(projectCode);
    const allocationId = text(row.AllocationId);
    lines.push({
      allocationId,
      timesheetId: text(row.TimesheetId),
      reference: text(row.ReferenceCode),
      periodId: text(row.PeriodId),
      workDate: dateOnly(row.WorkDate),
      employeeCode: text(row.EmployeeCode),
      employeeName: text(row.EmployeeName),
      employeeType: text(row.employment_type),
      department: text(row.department),
      supervisor: text(row.SupervisorName),
      location: text(row.LocationName),
      workCenter: text(row.WorkCenterName),
      projectCode,
      projectName: text(row.ProjectName) || manager?.projectName || projectCode,
      projectManager: manager?.name || '',
      projectManagerCode: manager?.code || '',
      shift: text(row.ShiftLabel) || 'Day',
      regularHours: num(row.RegularHours),
      ovtHours: num(row.OvtHours),
      nightSession: Boolean(row.NightSession),
      attendanceStatus: text(row.AttendanceStatus),
      timesheetStatus: text(row.Status),
      pmState: pmState.get(`${text(row.TimesheetId)}|${projectCode}`) || 'none',
      activity: text(row.Activity),
      chargeCode: text(row.ChargeCode),
      recordedDayKind: text(row.DayKind),
    });
    if (row.SnapRegular != null || row.SnapRate) {
      locked.push({
        allocationId,
        regularHours: num(row.SnapRegular),
        ovtHours: num(row.SnapOvt),
        nightSession: Boolean(row.SnapNight),
        regularCostKobo: row.RegularCost == null ? null : Math.round(num(row.RegularCost) * 100),
        ovtCostKobo: row.OvtCost == null ? null : Math.round(num(row.OvtCost) * 100),
        nightLabourKobo: row.NightLabour == null ? null : Math.round(num(row.NightLabour) * 100),
        nightAllowanceKobo: row.SnapAllowance == null ? null : Math.round(num(row.SnapAllowance) * 100),
        otherAllowanceKobo: row.OtherAllowance == null ? null : Math.round(num(row.OtherAllowance) * 100),
        totalKobo: row.TotalCost == null ? null : Math.round(num(row.TotalCost) * 100),
        rateVersion: text(row.SnapRate),
        method: text(row.SnapMethod),
      });
    }
  }

  const matches = (value: string, query: string) => !query || value.toLowerCase().includes(query.toLowerCase());
  const scoped = lines.filter((line) => {
    if (access.restrictToOwnProjects) {
      const ownCode = viewer.employeeCode.toLowerCase();
      const ownName = viewer.actor.toLowerCase();
      const manager = `${line.projectManager} ${line.projectManagerCode}`.toLowerCase();
      if (ownCode && !manager.includes(ownCode) && ownName && !manager.includes(ownName)) return false;
    }
    if (filters.project && !(`${line.projectCode} ${line.projectName}`.toLowerCase().includes(filters.project.toLowerCase()))) return false;
    if (filters.projectManager && !(`${line.projectManager} ${line.projectManagerCode}`.toLowerCase().includes(filters.projectManager.toLowerCase()))) return false;
    if (!matches(line.department, filters.department || '')) return false;
    if (!matches(line.supervisor, filters.supervisor || '')) return false;
    if (!matches(line.location, filters.location || '')) return false;
    if (!matches(line.workCenter, filters.workCenter || '')) return false;
    if (filters.employee && !(`${line.employeeCode} ${line.employeeName}`.toLowerCase().includes(filters.employee.toLowerCase()))) return false;
    if (!matches(line.employeeType, filters.employeeType || '')) return false;
    return true;
  });

  const capacity = await workforceCapacity(connection, from, to, holidayDates, filters);
  const approvalFiltered = filters.approval
    ? scoped.filter((line) => approvalLabelFor(line.timesheetStatus, line.pmState) === filters.approval)
    : scoped;
  const report = buildLabourReport({
    lines: approvalFiltered,
    holidays: holidayDates,
    rates,
    budgets,
    locked,
    adjustments,
    capacityHours: capacity,
    category: filters.category,
    periodStart: from,
    periodEnd: to,
    asOf: new Date().toISOString().slice(0, 10),
  });
  await lockFinalized(connection, report);
  await connection.request()
    .input('Id', sql.NVarChar(40), newId())
    .input('Actor', sql.NVarChar(120), viewer.actor || 'Timesheet User')
    .input('Filters', sql.NVarChar(sql.MAX), JSON.stringify({ ...filters, from, to, periodId: selected?.id || '' }))
    .input('Approved', sql.Decimal(19, 2), naira(report.overview.approvedCostKobo))
    .input('Provisional', sql.Decimal(19, 2), naira(report.overview.provisionalCostKobo))
    .input('Lines', sql.Int, report.lines.length)
    .query(`INSERT INTO [tsmgmt].[LabourReportAudit] ([Id],[Actor],[FiltersJson],[ApprovedTotal],[ProvisionalTotal],[LineCount]) VALUES (@Id,@Actor,@Filters,@Approved,@Provisional,@Lines)`);

  const optionOf = (values: string[]) => [...new Set(values.filter(Boolean))].sort((left, right) => left.localeCompare(right));
  return {
    report,
    view: present(report, {
      access,
      periods: periodRows,
      period: selected || null,
      from,
      to,
      filters,
      generatedBy: viewer.actor || 'Timesheet User',
      options: {
        projects: optionOf(scoped.map((line) => `${line.projectCode} ${line.projectName}`.trim())),
        managers: optionOf(scoped.map((line) => line.projectManager)),
        departments: optionOf(scoped.map((line) => line.department)),
        supervisors: optionOf(scoped.map((line) => line.supervisor)),
        locations: optionOf(scoped.map((line) => line.location)),
        workCenters: optionOf(scoped.map((line) => line.workCenter)),
        employees: optionOf(scoped.map((line) => `${line.employeeCode} ${line.employeeName}`.trim())),
        types: optionOf(scoped.map((line) => line.employeeType)),
      },
    }),
  };
};

const workforceCapacity = async (connection: sql.ConnectionPool, from: string, to: string, holidays: string[], filters: LabourFilters) => {
  const count = await optionalRows(() => connection.request()
    .input('Department', sql.NVarChar(180), filters.department || '')
    .input('Type', sql.NVarChar(80), filters.employeeType || '')
    .query(`
      SELECT COUNT(*) AS Headcount
      FROM [hris].[EmployeeMasterView]
      WHERE employee_code LIKE N'C[0-9]%'
        AND ISNULL(employment_status, N'') NOT LIKE N'%terminated%'
        AND ISNULL(employment_status, N'') NOT LIKE N'%inactive%'
        AND (@Department = N'' OR department = @Department)
        AND (@Type = N'' OR employment_type = @Type)
    `));
  const headcount = num(count.recordset?.[0]?.Headcount);
  if (!headcount) return null;
  let weekdays = 0;
  const cursor = new Date(`${from}T12:00:00Z`);
  const end = new Date(`${to}T12:00:00Z`);
  const holidaySet = new Set(holidays);
  while (cursor.getTime() <= end.getTime() && weekdays < 400) {
    if (dayKindForDate(cursor.toISOString().slice(0, 10), holidaySet) === 'weekday') weekdays += 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return weekdays > 0 ? headcount * weekdays * 8 : null;
};

const lockFinalized = async (connection: sql.ConnectionPool, report: LabourReport) => {
  // Only freeze lines that were actually costed. Locking a line with no rate would pin it at
  // "Not Available" permanently, even after a cost rate is added later.
  const rows = report.lines.filter((line) => line.finalized && !line.locked && line.totalCostKobo != null).map((line) => ({
    allocationId: line.allocationId,
    timesheetId: line.timesheetId,
    employeeCode: line.employeeCode,
    projectCode: line.projectCode,
    workDate: line.workDate,
    regularHours: line.regularHours,
    ovtHours: line.ovtHours,
    nightSession: line.nightSession ? 1 : 0,
    regularCost: naira(line.regularCostKobo),
    ovtCost: naira(line.ovtCostKobo),
    nightLabour: naira(line.nightLabourKobo),
    nightAllowance: naira(line.nightAllowanceKobo),
    otherAllowance: naira(line.otherAllowanceKobo),
    totalCost: naira(line.totalCostKobo),
    rateVersion: line.rateVersion || '',
    method: line.method || '',
    payrollStatus: line.approval,
  }));
  if (!rows.length) return;
  await connection.request()
    .input('Json', sql.NVarChar(sql.MAX), JSON.stringify(rows))
    .query(`
      INSERT INTO [tsmgmt].[LabourCostSnapshots]
        ([AllocationId],[TimesheetId],[EmployeeCode],[ProjectCode],[WorkDate],[RegularHours],[OvtHours],[NightSession],[RegularCost],[OvtCost],[NightLabour],[NightAllowance],[OtherAllowance],[TotalCost],[RateVersion],[Method],[PayrollStatus])
      SELECT j.allocationId, j.timesheetId, j.employeeCode, j.projectCode, j.workDate, j.regularHours, j.ovtHours, j.nightSession,
        j.regularCost, j.ovtCost, j.nightLabour, j.nightAllowance, j.otherAllowance, j.totalCost, j.rateVersion, j.method, j.payrollStatus
      FROM OPENJSON(@Json) WITH (
        allocationId nvarchar(40) '$.allocationId',
        timesheetId nvarchar(40) '$.timesheetId',
        employeeCode nvarchar(80) '$.employeeCode',
        projectCode nvarchar(80) '$.projectCode',
        workDate date '$.workDate',
        regularHours decimal(9,2) '$.regularHours',
        ovtHours decimal(9,2) '$.ovtHours',
        nightSession bit '$.nightSession',
        regularCost decimal(19,2) '$.regularCost',
        ovtCost decimal(19,2) '$.ovtCost',
        nightLabour decimal(19,2) '$.nightLabour',
        nightAllowance decimal(19,2) '$.nightAllowance',
        otherAllowance decimal(19,2) '$.otherAllowance',
        totalCost decimal(19,2) '$.totalCost',
        rateVersion nvarchar(40) '$.rateVersion',
        method nvarchar(20) '$.method',
        payrollStatus nvarchar(40) '$.payrollStatus'
      ) j
      WHERE NOT EXISTS (SELECT 1 FROM [tsmgmt].[LabourCostSnapshots] s WHERE s.[AllocationId] = j.allocationId)
    `);
};

const groupLabourLines = (lines: LabourReport['lines'], groupBy?: string) => {
  const keyName = groupBy || 'employee-project';
  if (keyName === 'detail') return lines;
  const grouped = new Map<string, LabourReport['lines'][number]>();
  const dates = new Map<string, number>();
  for (const line of lines) {
    const key = keyName === 'employee' ? line.employeeCode
      : keyName === 'project' ? line.projectCode
        : keyName === 'employee-project' ? `${line.employeeCode}|${line.projectCode}`
          : keyName === 'department' ? line.department
            : keyName === 'supervisor' ? line.supervisor
              : keyName === 'workDate' ? line.workDate
                : line.periodId;
    const sessions = line.nightSessionShare > 0 ? 1 : 0;
    dates.set(key, (dates.get(key) || 0) + 1);
    const current = grouped.get(key);
    if (!current) {
      grouped.set(key, { ...line, allocationId: key, nightSessionShare: sessions });
      continue;
    }
    current.weekdayRegular += line.weekdayRegular;
    current.weekdayOvt += line.weekdayOvt;
    current.saturdayHours += line.saturdayHours;
    current.saturdayOvt += line.saturdayOvt;
    current.sundayHours += line.sundayHours;
    current.sundayOvt += line.sundayOvt;
    current.phHours += line.phHours;
    current.phOvt += line.phOvt;
    current.nightHours += line.nightHours;
    current.uniqueHours += line.uniqueHours;
    current.nightSessionShare += sessions;
    if (current.approval !== line.approval) current.approval = 'Mixed' as LabourReport['lines'][number]['approval'];
    if (line.provisional) current.provisional = true;
    const add = (left: number | null, right: number | null) => (left == null || right == null ? null : left + right);
    current.regularCostKobo = add(current.regularCostKobo, line.regularCostKobo);
    current.ovtCostKobo = add(current.ovtCostKobo, line.ovtCostKobo);
    current.nightLabourKobo = add(current.nightLabourKobo, line.nightLabourKobo);
    current.nightAllowanceKobo = add(current.nightAllowanceKobo, line.nightAllowanceKobo);
    current.otherAllowanceKobo = add(current.otherAllowanceKobo, line.otherAllowanceKobo);
    current.totalCostKobo = add(current.totalCostKobo, line.totalCostKobo);
    current.adjustmentKobo += line.adjustmentKobo;
  }
  return [...grouped.entries()].map(([key, line]) => {
    const count = dates.get(key) || 1;
    return { ...line, workDate: count > 1 ? `${count} dates` : line.workDate };
  });
};

const moneyLine = (line: LabourReport['lines'][number], canSeeCosts: boolean, canSeeRates: boolean) => ({
  allocationId: line.allocationId,
  timesheetId: line.timesheetId,
  reference: line.reference,
  employeeCode: line.employeeCode,
  employeeName: line.employeeName,
  employeeType: line.employeeType,
  department: line.department,
  supervisor: line.supervisor,
  projectCode: line.projectCode,
  projectName: line.projectName,
  projectManager: line.projectManager,
  workDate: line.workDate,
  location: line.location,
  workCenter: line.workCenter,
  shift: line.shift,
  activity: line.activity,
  dayKind: line.dayKind,
  approval: line.approval,
  provisional: line.provisional,
  finalized: line.finalized,
  weekdayRegular: line.weekdayRegular,
  weekdayOvt: line.weekdayOvt,
  saturdayHours: line.saturdayHours,
  saturdayOvt: line.saturdayOvt,
  sundayHours: line.sundayHours,
  sundayOvt: line.sundayOvt,
  phHours: line.phHours,
  phOvt: line.phOvt,
  nightHours: line.nightHours,
  uniqueHours: line.uniqueHours,
  nightSessions: line.nightSessionShare > 1 ? Math.round(line.nightSessionShare) : (line.nightSessionShare > 0 ? 1 : 0),
  method: canSeeRates ? line.method : (line.method ? 'Restricted' : null),
  rateVersion: canSeeRates ? line.rateVersion : null,
  appliedRate: canSeeRates ? naira(line.appliedRateKobo) : null,
  regularCost: canSeeCosts ? naira(line.regularCostKobo) : null,
  ovtCost: canSeeCosts ? naira(line.ovtCostKobo) : null,
  nightLabour: canSeeCosts ? naira(line.nightLabourKobo) : null,
  nightAllowance: canSeeCosts ? naira(line.nightAllowanceKobo) : null,
  otherAllowance: canSeeCosts ? naira(line.otherAllowanceKobo) : null,
  adjustment: canSeeCosts ? naira(line.adjustmentKobo) : null,
  totalCost: canSeeCosts ? naira(line.totalCostKobo) : null,
  locked: line.locked,
  exceptions: line.exceptions,
});

/** How many employees in the selection can be costed. No amounts, so it is safe for every viewer. */
const rateCoverage = (lines: LabourReport['lines']) => {
  const all = new Set<string>();
  const missing = new Set<string>();
  let unpricedHours = 0;
  for (const line of lines) {
    all.add(line.employeeCode);
    if (line.totalCostKobo == null) {
      missing.add(line.employeeCode);
      unpricedHours += line.uniqueHours;
    }
  }
  return {
    costedEmployees: all.size - missing.size,
    missingRateEmployees: missing.size,
    unpricedHours: Math.round(unpricedHours * 100) / 100,
    missingRateSample: [...missing].sort().slice(0, 8),
  };
};

const present = (
  report: LabourReport,
  context: {
    access: ReturnType<typeof labourAccess>;
    periods: Array<{ id: string; name: string; startDate: string; endDate: string; status: string }>;
    period: { id: string; name: string; startDate: string; endDate: string; status: string } | null;
    from: string;
    to: string;
    filters: LabourFilters;
    generatedBy: string;
    options: Record<string, string[]>;
  },
) => {
  const pageSize = Math.min(100, Math.max(10, context.filters.pageSize || 25));
  const linePage = Math.max(1, context.filters.linePage || 1);
  const costs = context.access.canSeeCosts;
  const projects = report.projects.map((project) => ({
    projectCode: project.projectCode,
    projectName: project.projectName,
    projectManager: project.projectManager,
    employees: project.employees,
    weekdayRegular: project.weekdayRegular,
    weekdayOvt: project.weekdayOvt,
    saturdayHours: project.saturdayHours,
    saturdayOvt: project.saturdayOvt,
    sundayHours: project.sundayHours,
    sundayOvt: project.sundayOvt,
    phHours: project.phHours,
    phOvt: project.phOvt,
    nightHours: project.nightHours,
    uniqueHours: project.uniqueHours,
    plannedHours: project.plannedHours,
    utilization: project.utilization,
    hourVariance: project.hourVariance,
    regularCost: costs ? naira(project.regularCostKobo) : null,
    ovtCost: costs ? naira(project.ovtCostKobo) : null,
    nightLabour: costs ? naira(project.nightLabourKobo) : null,
    nightAllowance: costs ? naira(project.nightAllowanceKobo) : null,
    otherAllowance: costs ? naira(project.otherAllowanceKobo) : null,
    approvedCost: costs ? naira(project.approvedCostKobo) : null,
    provisionalCost: costs ? naira(project.provisionalCostKobo) : null,
    labourBudget: costs ? naira(project.labourBudgetKobo) : null,
    variance: costs ? naira(project.varianceKobo) : null,
    budgetUtilization: costs ? project.budgetUtilization : null,
    remainingBudget: costs ? naira(project.remainingBudgetKobo) : null,
    forecast: costs ? naira(project.forecastKobo) : null,
    forecastMethod: project.forecastMethod,
    status: project.labourBudgetKobo == null ? 'Budget Not Configured' : project.status,
    costIncomplete: project.costIncomplete,
  }));
  return {
    version: report.version,
    generatedAt: new Date().toISOString(),
    generatedBy: context.generatedBy,
    access: context.access,
    period: context.period,
    from: context.from,
    to: context.to,
    periods: context.periods,
    assumptions: report.overview.assumptions,
    overview: {
      totalHours: report.overview.totalHours,
      approvedHours: report.overview.approvedHours,
      provisionalHours: report.overview.provisionalHours,
      regularHours: report.overview.regularHours,
      overtimeHours: report.overview.overtimeHours,
      nightHours: report.overview.nightHours,
      employees: report.overview.employees,
      projects: report.overview.projects,
      approvedCost: costs ? naira(report.overview.approvedCostKobo) : null,
      provisionalCost: costs ? naira(report.overview.provisionalCostKobo) : null,
      labourBudget: costs ? naira(report.overview.labourBudgetKobo) : null,
      budgetVariance: costs ? naira(report.overview.budgetVarianceKobo) : null,
      budgetConfigured: report.overview.budgetConfigured,
      projectUtilization: report.overview.projectUtilization,
      workforceUtilization: report.overview.workforceUtilization,
      capacityHours: report.overview.capacityHours,
      plannedHours: report.overview.plannedHours,
      nightSessions: report.overview.nightSessions,
      nightAllowance: costs ? naira(report.overview.nightAllowanceKobo) : null,
      ...rateCoverage(report.lines),
    },
    trend: report.trend.map((point) => ({
      date: point.date,
      hours: point.hours,
      approvedCost: costs ? naira(point.approvedCostKobo) : null,
      provisionalCost: costs ? naira(point.provisionalCostKobo) : null,
    })),
    projects,
    projectTotal: projects.length,
    employeeProjects: groupLabourLines(report.lines, 'employee-project').map((line) => moneyLine(line, costs, context.access.canSeeRates)),
    lines: groupLabourLines(report.lines, context.filters.groupBy || 'employee-project').slice((linePage - 1) * pageSize, linePage * pageSize).map((line) => moneyLine(line, costs, context.access.canSeeRates)),
    lineTotal: groupLabourLines(report.lines, context.filters.groupBy || 'employee-project').length,
    linePage,
    pageSize,
    exceptions: report.exceptions.slice(0, 200),
    exceptionTotal: report.exceptions.length,
    options: context.options,
  };
};

export const saveLabourRate = async (input: Record<string, unknown>, viewer: LabourViewer) => {
  if (!labourAccess(viewer).canManageRates) throw new Error('You do not have permission to maintain project labour cost rates.');
  const employeeCode = text(input.employeeCode).toUpperCase();
  const method = text(input.method).toLowerCase();
  const amount = num(input.amount);
  const effectiveFrom = dateOnly(input.effectiveFrom);
  if (!employeeCode || !method || !effectiveFrom || amount < 0) throw new Error('Employee, costing method, amount, and effective date are required.');
  if (!['hourly', 'daily', 'monthly', 'lumpsum', 'expatriate'].includes(method)) throw new Error('Choose a supported costing method.');
  const connection = await pool();
  const version = text(input.rateVersion) || `v-${effectiveFrom}`;
  await connection.request()
    .input('Code', sql.NVarChar(80), employeeCode)
    .input('From', sql.Date, effectiveFrom)
    .query(`UPDATE [tsmgmt].[LabourCostRates] SET [EffectiveTo] = DATEADD(day, -1, @From) WHERE [EmployeeCode] = @Code AND [EffectiveTo] IS NULL AND [EffectiveFrom] < @From`);
  await connection.request()
    .input('Id', sql.NVarChar(40), newId())
    .input('Code', sql.NVarChar(80), employeeCode)
    .input('Method', sql.NVarChar(20), method)
    .input('Currency', sql.NVarChar(8), text(input.currency) || 'NGN')
    .input('Amount', sql.Decimal(19, 4), amount)
    .input('Exchange', sql.Decimal(18, 8), input.exchangeRate == null || input.exchangeRate === '' ? null : num(input.exchangeRate))
    .input('ExchangeVersion', sql.NVarChar(40), text(input.exchangeRateVersion))
    .input('Version', sql.NVarChar(40), version)
    .input('From', sql.Date, effectiveFrom)
    .input('WorkingDays', sql.Decimal(9, 2), input.workingDays == null || input.workingDays === '' ? null : num(input.workingDays))
    .input('Standard', sql.Decimal(9, 2), num(input.standardHours) || 8)
    .input('WeekdayOvt', sql.Decimal(9, 4), input.weekdayOvt == null || input.weekdayOvt === '' ? null : num(input.weekdayOvt))
    .input('Saturday', sql.Decimal(9, 4), input.saturday == null || input.saturday === '' ? null : num(input.saturday))
    .input('SaturdayOvt', sql.Decimal(9, 4), input.saturdayOvt == null || input.saturdayOvt === '' ? null : num(input.saturdayOvt))
    .input('Sunday', sql.Decimal(9, 4), input.sunday == null || input.sunday === '' ? null : num(input.sunday))
    .input('SundayOvt', sql.Decimal(9, 4), input.sundayOvt == null || input.sundayOvt === '' ? null : num(input.sundayOvt))
    .input('Ph', sql.Decimal(9, 4), input.publicHoliday == null || input.publicHoliday === '' ? null : num(input.publicHoliday))
    .input('PhOvt', sql.Decimal(9, 4), input.publicHolidayOvt == null || input.publicHolidayOvt === '' ? null : num(input.publicHolidayOvt))
    .input('Night', sql.Decimal(9, 4), input.night == null || input.night === '' ? null : num(input.night))
    .input('NightAllowance', sql.Decimal(19, 2), input.nightAllowance == null || input.nightAllowance === '' ? null : num(input.nightAllowance))
    .input('Offshore', sql.Decimal(19, 2), input.offshoreAllowance == null || input.offshoreAllowance === '' ? null : num(input.offshoreAllowance))
    .input('Notes', sql.NVarChar(400), `${MANUAL_RATE_MARKER} | form${text(input.notes) ? ` | ${text(input.notes)}` : ''}`.slice(0, 400))
    .input('Actor', sql.NVarChar(120), viewer.actor)
    .query(`INSERT INTO [tsmgmt].[LabourCostRates]
      ([Id],[EmployeeCode],[Method],[Currency],[Amount],[ExchangeRate],[ExchangeRateVersion],[RateVersion],[EffectiveFrom],[WorkingDays],[StandardHours],[WeekdayOvtMultiplier],[SaturdayMultiplier],[SaturdayOvtMultiplier],[SundayMultiplier],[SundayOvtMultiplier],[PhMultiplier],[PhOvtMultiplier],[NightMultiplier],[NightAllowance],[OffshoreAllowance],[Notes],[CreatedBy])
      VALUES (@Id,@Code,@Method,@Currency,@Amount,@Exchange,@ExchangeVersion,@Version,@From,@WorkingDays,@Standard,@WeekdayOvt,@Saturday,@SaturdayOvt,@Sunday,@SundayOvt,@Ph,@PhOvt,@Night,@NightAllowance,@Offshore,@Notes,@Actor)`);
};

export const saveLabourAdjustment = async (input: Record<string, unknown>, viewer: LabourViewer) => {
  if (!labourAccess(viewer).canAdjust) throw new Error('You do not have permission to adjust locked labour cost.');
  const reason = text(input.reason);
  if (!reason) throw new Error('An adjustment reason is required.');
  const connection = await pool();
  await connection.request()
    .input('Id', sql.NVarChar(40), newId())
    .input('AllocationId', sql.NVarChar(40), text(input.allocationId))
    .input('ProjectCode', sql.NVarChar(80), text(input.projectCode))
    .input('EmployeeCode', sql.NVarChar(80), text(input.employeeCode))
    .input('WorkDate', sql.Date, dateOnly(input.workDate))
    .input('Component', sql.NVarChar(40), text(input.component) || 'Total')
    .input('Original', sql.Decimal(19, 2), num(input.originalAmount))
    .input('Corrected', sql.Decimal(19, 2), num(input.correctedAmount))
    .input('Reason', sql.NVarChar(500), reason)
    .input('Requested', sql.NVarChar(120), text(input.requestedBy) || viewer.actor)
    .input('Approved', sql.NVarChar(120), viewer.actor)
    .query(`INSERT INTO [tsmgmt].[LabourCostAdjustments]
      ([Id],[AllocationId],[ProjectCode],[EmployeeCode],[WorkDate],[Component],[OriginalAmount],[CorrectedAmount],[Reason],[RequestedBy],[ApprovedBy])
      VALUES (@Id,@AllocationId,@ProjectCode,@EmployeeCode,@WorkDate,@Component,@Original,@Corrected,@Reason,@Requested,@Approved)`);
};

export const saveLabourBudget = async (input: Record<string, unknown>, viewer: LabourViewer) => {
  if (!labourAccess(viewer).canSetBudget) throw new Error('You do not have permission to record a project labour budget.');
  const projectCode = text(input.projectCode).toUpperCase();
  if (!projectCode) throw new Error('A project code is required.');
  const connection = await pool();
  await connection.request()
    .input('ProjectCode', sql.NVarChar(80), projectCode)
    .input('Budget', sql.Decimal(19, 2), num(input.labourBudget))
    .input('Notes', sql.NVarChar(400), text(input.notes))
    .input('Actor', sql.NVarChar(120), viewer.actor)
    .query(`
      MERGE [tsmgmt].[ProjectLabourBudgets] AS target
      USING (SELECT @ProjectCode AS ProjectCode) AS source ON target.[ProjectCode] = source.ProjectCode
      WHEN MATCHED THEN UPDATE SET [LabourBudget] = @Budget, [Notes] = @Notes, [UpdatedBy] = @Actor, [UpdatedAt] = SYSUTCDATETIME()
      WHEN NOT MATCHED THEN INSERT ([ProjectCode],[LabourBudget],[Notes],[UpdatedBy]) VALUES (@ProjectCode,@Budget,@Notes,@Actor);
    `);
};

/* ------------------------------------------------------------------ rate sources */

type StoredRate = LabourRateInput & { id: string; effectiveTo: string };

const storedRateFrom = (row: Record<string, unknown>): StoredRate => {
  const optional = (value: unknown) => (value == null ? null : num(value));
  return {
    id: text(row.Id),
    employeeCode: text(row.EmployeeCode).toUpperCase(),
    method: text(row.Method).toLowerCase() as LabourRateInput['method'],
    amount: num(row.Amount),
    currency: text(row.Currency) || 'NGN',
    exchangeRate: optional(row.ExchangeRate),
    effectiveFrom: dateOnly(row.EffectiveFrom),
    effectiveTo: dateOnly(row.EffectiveTo),
    workingDays: optional(row.WorkingDays),
    standardHours: num(row.StandardHours) || 8,
    weekdayOvt: optional(row.WeekdayOvtMultiplier),
    saturday: optional(row.SaturdayMultiplier),
    saturdayOvt: optional(row.SaturdayOvtMultiplier),
    sunday: optional(row.SundayMultiplier),
    sundayOvt: optional(row.SundayOvtMultiplier),
    publicHoliday: optional(row.PhMultiplier),
    publicHolidayOvt: optional(row.PhOvtMultiplier),
    rateVersion: text(row.RateVersion),
    notes: text(row.Notes),
  };
};

const dayBefore = (iso: string) => {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
};

/** The rate in force on a date: latest effective-from that covers it. */
const rateInForce = (rates: StoredRate[], on: string) => rates
  .filter((rate) => rate.effectiveFrom <= on && (!rate.effectiveTo || rate.effectiveTo >= on))
  .sort((left, right) => right.effectiveFrom.localeCompare(left.effectiveFrom))[0] || null;

export type RateWriteSummary = { written: number; unchanged: number; manualKept: number };

/**
 * Writes rates with effective-dated history: the rate in force before the new start is closed the day
 * before, a rate starting the same day is replaced, and a later-dated rate bounds the new one.
 * With `protectManual`, an employee whose rate in force is a MANUAL override is left untouched.
 */
const writeRates = async (
  transaction: sql.Transaction,
  incoming: LabourRateInput[],
  actor: string,
  options: { protectManual: boolean },
): Promise<RateWriteSummary> => {
  const existing = await new sql.Request(transaction).query(`SELECT * FROM [tsmgmt].[LabourCostRates] WITH (UPDLOCK, HOLDLOCK)`);
  const byEmployee = new Map<string, StoredRate[]>();
  for (const row of existing.recordset || []) {
    const rate = storedRateFrom(row);
    byEmployee.set(rate.employeeCode, [...(byEmployee.get(rate.employeeCode) || []), rate]);
  }
  const summary: RateWriteSummary = { written: 0, unchanged: 0, manualKept: 0 };
  for (const rate of incoming) {
    const code = rate.employeeCode.toUpperCase();
    const history = byEmployee.get(code) || [];
    const current = rateInForce(history, rate.effectiveFrom)
      || [...history].filter((item) => !item.effectiveTo).sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0]
      || null;
    if (options.protectManual && history.some((item) => !item.effectiveTo && isManualRateNote(item.notes))) { summary.manualKept += 1; continue; }
    if (current && current.effectiveFrom <= rate.effectiveFrom && sameRate(current, rate)) { summary.unchanged += 1; continue; }

    for (const item of history.filter((entry) => entry.effectiveFrom === rate.effectiveFrom)) {
      await new sql.Request(transaction).input('Id', sql.NVarChar(40), item.id).query(`DELETE FROM [tsmgmt].[LabourCostRates] WHERE [Id] = @Id`);
    }
    const remaining = history.filter((item) => item.effectiveFrom !== rate.effectiveFrom);
    for (const item of remaining) {
      if (item.effectiveFrom < rate.effectiveFrom && (!item.effectiveTo || item.effectiveTo >= rate.effectiveFrom)) {
        item.effectiveTo = dayBefore(rate.effectiveFrom);
        await new sql.Request(transaction)
          .input('Id', sql.NVarChar(40), item.id)
          .input('To', sql.Date, item.effectiveTo)
          .query(`UPDATE [tsmgmt].[LabourCostRates] SET [EffectiveTo] = @To WHERE [Id] = @Id`);
      }
    }
    const nextStart = remaining.filter((item) => item.effectiveFrom > rate.effectiveFrom).map((item) => item.effectiveFrom).sort()[0];
    const effectiveTo = nextStart ? dayBefore(nextStart) : null;
    const id = newId();
    await new sql.Request(transaction)
      .input('Id', sql.NVarChar(40), id)
      .input('Code', sql.NVarChar(80), code)
      .input('Method', sql.NVarChar(20), rate.method)
      .input('Currency', sql.NVarChar(8), rate.currency || 'NGN')
      .input('Amount', sql.Decimal(19, 4), rate.amount)
      .input('Exchange', sql.Decimal(18, 8), rate.exchangeRate)
      .input('Version', sql.NVarChar(40), rate.rateVersion)
      .input('From', sql.Date, rate.effectiveFrom)
      .input('To', sql.Date, effectiveTo)
      .input('WorkingDays', sql.Decimal(9, 2), rate.workingDays)
      .input('Standard', sql.Decimal(9, 2), rate.standardHours || 8)
      .input('WeekdayOvt', sql.Decimal(9, 4), rate.weekdayOvt)
      .input('Saturday', sql.Decimal(9, 4), rate.saturday)
      .input('SaturdayOvt', sql.Decimal(9, 4), rate.saturdayOvt)
      .input('Sunday', sql.Decimal(9, 4), rate.sunday)
      .input('SundayOvt', sql.Decimal(9, 4), rate.sundayOvt)
      .input('Ph', sql.Decimal(9, 4), rate.publicHoliday)
      .input('PhOvt', sql.Decimal(9, 4), rate.publicHolidayOvt)
      .input('Notes', sql.NVarChar(400), rate.notes)
      .input('Actor', sql.NVarChar(120), actor)
      .query(`INSERT INTO [tsmgmt].[LabourCostRates]
        ([Id],[EmployeeCode],[Method],[Currency],[Amount],[ExchangeRate],[RateVersion],[EffectiveFrom],[EffectiveTo],[WorkingDays],[StandardHours],[WeekdayOvtMultiplier],[SaturdayMultiplier],[SaturdayOvtMultiplier],[SundayMultiplier],[SundayOvtMultiplier],[PhMultiplier],[PhOvtMultiplier],[Notes],[CreatedBy])
        VALUES (@Id,@Code,@Method,@Currency,@Amount,@Exchange,@Version,@From,@To,@WorkingDays,@Standard,@WeekdayOvt,@Saturday,@SaturdayOvt,@Sunday,@SundayOvt,@Ph,@PhOvt,@Notes,@Actor)`);
    byEmployee.set(code, [...remaining, { ...rate, id, effectiveTo: effectiveTo || '' }]);
    summary.written += 1;
  }
  return summary;
};

const earliestPeriodStart = async (connection: sql.ConnectionPool) => {
  const result = await connection.request().query(`SELECT MIN([StartDate]) AS StartDate FROM [tsmgmt].[Periods]`);
  return dateOnly(result.recordset?.[0]?.StartDate) || new Date().toISOString().slice(0, 10);
};

/** Latest payroll day rate, salary and employer contribution lines per employee code (one row per code). */
const readPayrollDayRates = async (connection: sql.ConnectionPool) => {
  const result = await connection.request().query(`
    SELECT code, rate_per_day, pay_currency, period_salary, contributions FROM (
      SELECT UPPER(LTRIM(RTRIM(v.employee_code))) AS code, p.rate_per_day, p.pay_currency, p.period_salary,
        COALESCE(NULLIF(LTRIM(RTRIM(p.sage_contribution_lines_json)), N'[]'), p.sage_local_contribution_lines_json) AS contributions,
        ROW_NUMBER() OVER (PARTITION BY UPPER(LTRIM(RTRIM(v.employee_code))) ORDER BY p.modified_at DESC, p.created_at DESC) AS rn
      FROM [hris].[EmployeePayrollSetup] p
      INNER JOIN (SELECT DISTINCT employee_id, employee_code FROM [hris].[EmployeeMasterView]) v ON v.employee_id = p.employee_id
      WHERE ISNULL(v.employee_code, N'') <> N''
    ) ranked WHERE rn = 1
  `);
  return new Map((result.recordset || []).map((row) => [text(row.code), {
    ratePerDay: row.rate_per_day == null ? null : num(row.rate_per_day),
    currency: text(row.pay_currency) || 'NGN',
    employerOnCostPercent: employerOnCostPercent(row.contributions, row.period_salary, row.pay_currency),
  }]));
};

export type PayrollSeedResult = RateWriteSummary & {
  effectiveFrom: string;
  onCostBasis: OnCostBasis;
  onCostPercent: number;
  withEmployerContributions: number;
  noPayrollRate: number;
  nonNgn: string[];
};

/**
 * Seeds project labour rates from each employee's payroll day rate. Manual overrides are kept.
 * On-cost basis 'actual' (default) loads each rate by that employee's own employer contributions in
 * payroll; 'flat' applies one % to everyone.
 */
export const seedLabourRatesFromPayroll = async (input: Record<string, unknown>, viewer: LabourViewer): Promise<PayrollSeedResult> => {
  if (!labourAccess(viewer).canManageRates) throw new Error('You do not have permission to maintain project labour cost rates.');
  const onCostBasis: OnCostBasis = text(input.onCostBasis) === 'flat' ? 'flat' : 'actual';
  const onCostPercent = onCostBasis === 'flat' ? num(input.onCostPercent) : 0;
  if (onCostPercent < 0 || onCostPercent > 200) throw new Error('On-cost must be between 0% and 200%.');
  const connection = await pool();
  const effectiveFrom = dateOnly(input.effectiveFrom) || await earliestPeriodStart(connection);
  const seededOn = new Date().toISOString().slice(0, 10);
  const payroll = await readPayrollDayRates(connection);
  const rates: LabourRateInput[] = [];
  let noPayrollRate = 0;
  let withEmployerContributions = 0;
  const nonNgn: string[] = [];
  for (const [code, source] of payroll) {
    const percent = onCostBasis === 'actual' ? source.employerOnCostPercent : onCostPercent;
    const rate = payrollSeedRate(
      { employeeCode: code, ratePerDay: source.ratePerDay, currency: source.currency },
      { effectiveFrom, onCostPercent: percent, onCostBasis, seededOn },
    );
    if (!rate) { noPayrollRate += 1; continue; }
    if (onCostBasis === 'actual' && percent > 0) withEmployerContributions += 1;
    if (rate.currency !== 'NGN') nonNgn.push(code);
    rates.push(rate);
  }
  const transaction = new sql.Transaction(connection);
  await transaction.begin();
  try {
    const summary = await writeRates(transaction, rates, viewer.actor || 'Timesheet User', { protectManual: true });
    await transaction.commit();
    return { ...summary, effectiveFrom, onCostBasis, onCostPercent, withEmployerContributions, noPayrollRate, nonNgn };
  } catch (error) {
    await transaction.rollback().catch(() => undefined);
    throw error;
  }
};

/** Rate sheet for Finance: every employee with a booking or a rate, prefilled with the rate in force. */
export const buildLabourRateSheet = async (viewer: LabourViewer) => {
  if (!labourAccess(viewer).canManageRates) throw new Error('You do not have permission to maintain project labour cost rates.');
  const connection = await pool();
  const [people, rateRows, payroll] = await Promise.all([
    connection.request().query(`
      SELECT UPPER(LTRIM(RTRIM(l.[EmployeeCode]))) AS code, MAX(l.[EmployeeName]) AS name
      FROM [tsmgmt].[TimesheetEntryLines] l
      WHERE ISNULL(l.[EmployeeCode], N'') <> N''
      GROUP BY UPPER(LTRIM(RTRIM(l.[EmployeeCode])))
    `),
    connection.request().query(`SELECT * FROM [tsmgmt].[LabourCostRates]`),
    readPayrollDayRates(connection),
  ]);
  const today = new Date().toISOString().slice(0, 10);
  const rates = new Map<string, StoredRate[]>();
  for (const row of rateRows.recordset || []) {
    const rate = storedRateFrom(row);
    rates.set(rate.employeeCode, [...(rates.get(rate.employeeCode) || []), rate]);
  }
  const names = new Map((people.recordset || []).map((row) => [text(row.code), text(row.name)]));
  for (const code of rates.keys()) if (!names.has(code)) names.set(code, '');
  const employees: RateSheetEmployee[] = [...names.entries()]
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([code, name]) => {
      const history = rates.get(code) || [];
      const current = rateInForce(history, today) || [...history].sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0] || null;
      return { employeeCode: code, employeeName: name, payrollDayRate: payroll.get(code)?.ratePerDay ?? null, current };
    });
  const guide: Array<Array<string | number | null>> = [
    ['How to use this sheet'],
    ['1. Change Method, Amount or multipliers only for employees you want to override. Leave other rows as they are.'],
    ['2. Clear the Amount cell on any row you do not want to import. Rows without an Amount are skipped.'],
    ['3. Method: hourly (Amount per hour), daily (per day), monthly (per month, needs Working Days), lumpsum, expatriate.'],
    ['4. Effective From: YYYY-MM-DD or DD/MM/YYYY. Blank uses the earliest timesheet period start.'],
    ['   To change a rate from a given date, set Effective From to that date. Keeping the existing date corrects the rate for its whole period.'],
    ['5. A non-NGN currency needs an Exchange Rate to NGN.'],
    ['6. Blank multipliers default to payroll: weekday OVT 1.5, Saturday 1.5, Sunday 2, PH 2.'],
    ['7. Uploaded rows are saved as Manual and are not replaced by a later payroll seed.'],
    [],
    ['Payroll Day Rate is for reference only (from Employee Payroll Setup) and is not imported.'],
  ];
  return buildSimpleWorkbook([{ name: 'Rates', rows: rateSheetRows(employees) }, { name: 'Guide', rows: guide }]);
};

export type RateImportResult = RateWriteSummary & {
  rows: number;
  blankRows: number;
  errors: Array<{ row: number; employeeCode: string; message: string }>;
};

/** Imports an edited rate sheet (.xlsx or .csv). Nothing is saved if any row has an error. */
export const importLabourRates = async (input: Record<string, unknown>, viewer: LabourViewer): Promise<RateImportResult> => {
  if (!labourAccess(viewer).canManageRates) throw new Error('You do not have permission to maintain project labour cost rates.');
  const fileName = text(input.fileName).toLowerCase();
  const content = Buffer.from(text(input.contentBase64), 'base64');
  if (!content.length) throw new Error('Choose a rate sheet to upload.');
  if (content.length > 5 * 1024 * 1024) throw new Error('The rate sheet is larger than 5 MB.');
  const isZip = content.subarray(0, 2).toString() === 'PK';
  if (!isZip && /\.xlsx?$/.test(fileName)) throw new Error('This Excel file could not be read. Save it as .xlsx (Excel Workbook) or .csv and try again.');
  const rows = isZip ? readFirstSheetRows(content) : readDelimitedRows(content.toString('utf8'));
  const connection = await pool();
  const today = new Date().toISOString().slice(0, 10);
  const parsed = parseRateSheet(rows, { defaultEffectiveFrom: await earliestPeriodStart(connection), importedOn: today });

  const known = await connection.request().query(`SELECT DISTINCT UPPER(LTRIM(RTRIM(employee_code))) AS code FROM [hris].[EmployeeMasterView] WHERE ISNULL(employee_code, N'') <> N''`);
  const codes = new Set((known.recordset || []).map((row) => text(row.code)));
  const errors = [...parsed.errors];
  for (const rate of parsed.rates) {
    if (!codes.has(rate.employeeCode)) errors.push({ row: 0, employeeCode: rate.employeeCode, message: 'Employee code is not in the employee directory' });
  }
  const empty: RateWriteSummary = { written: 0, unchanged: 0, manualKept: 0 };
  if (errors.length) return { ...empty, rows: parsed.rates.length, blankRows: parsed.blankRows, errors };
  if (!parsed.rates.length) throw new Error('No rows with an Amount were found in the rate sheet.');

  const transaction = new sql.Transaction(connection);
  await transaction.begin();
  try {
    const summary = await writeRates(transaction, parsed.rates, viewer.actor || 'Timesheet User', { protectManual: false });
    await transaction.commit();
    return { ...summary, rows: parsed.rates.length, blankRows: parsed.blankRows, errors: [] };
  } catch (error) {
    await transaction.rollback().catch(() => undefined);
    throw error;
  }
};
