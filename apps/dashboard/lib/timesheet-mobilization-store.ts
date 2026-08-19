import sql from 'mssql';
import { getDleEnterpriseDbPool } from '@/lib/dle-enterprise-db';
import {
  OFFSHORE_LOCATION_NAME,
  offshoreWorkCenterName,
} from '@/lib/timesheet-entry-shared';

export type MobilizationStatus = 'Planned' | 'Mobilized' | 'Demobilized' | 'Cancelled';

export type TimesheetMobilization = {
  id: string;
  employeeCode: string;
  employeeName: string;
  homeWorkCenterName: string | null;
  supervisorId: string;
  supervisorName: string;
  projectCode: string;
  projectName: string;
  workCenterName: string;
  locationName: string;
  startDate: string;
  endDate: string | null;
  status: MobilizationStatus;
  reason: string | null;
  createdAt: string;
  createdBy: string;
  updatedAt: string | null;
  updatedBy: string | null;
};

export type CreateMobilizationInput = {
  employeeCodes: string[];
  employees?: Array<{ employeeCode: string; employeeName?: string; homeWorkCenterName?: string | null }>;
  supervisorId: string;
  supervisorName: string;
  projectCode: string;
  projectName: string;
  startDate: string;
  endDate?: string | null;
  reason?: string | null;
  actor: string;
};

const clean = (value: unknown) => String(value || '').trim();
const dateOnly = (value: unknown) => clean(value).slice(0, 10);
const iso = (value: unknown) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const poolOrThrow = async () => {
  const pool = await getDleEnterpriseDbPool();
  if (!pool) throw new Error('DLE Enterprise database is not configured.');
  await ensureMobilizationSchema(pool);
  return pool;
};

async function ensureMobilizationSchema(pool: sql.ConnectionPool) {
  await pool.request().query(`
IF SCHEMA_ID(N'hris') IS NULL EXEC(N'CREATE SCHEMA [hris]');
IF OBJECT_ID(N'[hris].[TimesheetMobilizations]', N'U') IS NULL
CREATE TABLE [hris].[TimesheetMobilizations] (
  [Id] NVARCHAR(160) NOT NULL CONSTRAINT [PK_TimesheetMobilizations] PRIMARY KEY,
  [EmployeeCode] NVARCHAR(80) NOT NULL,
  [EmployeeName] NVARCHAR(220) NOT NULL,
  [HomeWorkCenterName] NVARCHAR(180) NULL,
  [SupervisorId] NVARCHAR(180) NOT NULL,
  [SupervisorName] NVARCHAR(220) NOT NULL,
  [ProjectCode] NVARCHAR(50) NOT NULL,
  [ProjectName] NVARCHAR(255) NOT NULL,
  [WorkCenterName] NVARCHAR(180) NOT NULL,
  [LocationName] NVARCHAR(180) NOT NULL,
  [StartDate] DATE NOT NULL,
  [EndDate] DATE NULL,
  [Status] NVARCHAR(30) NOT NULL,
  [Reason] NVARCHAR(500) NULL,
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_TimesheetMobilizations_CreatedAt] DEFAULT SYSUTCDATETIME(),
  [CreatedBy] NVARCHAR(120) NOT NULL,
  [UpdatedAt] DATETIME2(0) NULL,
  [UpdatedBy] NVARCHAR(120) NULL
);
`);
}

const mapRow = (row: Record<string, unknown>): TimesheetMobilization => ({
  id: String(row.Id),
  employeeCode: clean(row.EmployeeCode),
  employeeName: clean(row.EmployeeName),
  homeWorkCenterName: clean(row.HomeWorkCenterName) || null,
  supervisorId: clean(row.SupervisorId),
  supervisorName: clean(row.SupervisorName),
  projectCode: clean(row.ProjectCode).toUpperCase(),
  projectName: clean(row.ProjectName),
  workCenterName: clean(row.WorkCenterName),
  locationName: clean(row.LocationName) || OFFSHORE_LOCATION_NAME,
  startDate: dateOnly(row.StartDate),
  endDate: row.EndDate ? dateOnly(row.EndDate) : null,
  status: (clean(row.Status) || 'Mobilized') as MobilizationStatus,
  reason: clean(row.Reason) || null,
  createdAt: iso(row.CreatedAt) || new Date().toISOString(),
  createdBy: clean(row.CreatedBy),
  updatedAt: iso(row.UpdatedAt),
  updatedBy: clean(row.UpdatedBy) || null,
});

export const mobilizationCoversDate = (item: TimesheetMobilization, date: string) => {
  if (item.status === 'Cancelled') return false;
  if (item.status === 'Demobilized' && item.endDate && date > item.endDate) return false;
  if (date < item.startDate) return false;
  if (item.endDate && date > item.endDate) return false;
  return true;
};

export const mobilizationMatchesSupervisor = (item: TimesheetMobilization, supervisorId: string) => {
  const selected = clean(supervisorId).toLowerCase();
  if (!selected) return false;
  const id = item.supervisorId.toLowerCase();
  const name = item.supervisorName.toLowerCase();
  const code = id.split(' - ')[0]?.trim();
  return id === selected
    || selected.includes(id)
    || id.includes(selected)
    || Boolean(code && selected.includes(code))
    || Boolean(name && selected.includes(name));
};

export async function readTimesheetMobilizations(filters: {
  date?: string;
  supervisorId?: string;
  projectCode?: string;
  employeeCode?: string;
  status?: MobilizationStatus | 'Active';
} = {}): Promise<TimesheetMobilization[]> {
  const pool = await poolOrThrow();
  const result = await pool.request().query(`
SELECT * FROM [hris].[TimesheetMobilizations]
ORDER BY [StartDate] DESC, [SupervisorName], [EmployeeName]
`);
  let rows = result.recordset.map(mapRow);
  if (filters.supervisorId) {
    const key = filters.supervisorId.toLowerCase();
    rows = rows.filter((item) => item.supervisorId.toLowerCase() === key || item.supervisorId.toLowerCase().includes(key) || key.includes(item.supervisorId.toLowerCase()));
  }
  if (filters.projectCode) {
    const code = filters.projectCode.toUpperCase();
    rows = rows.filter((item) => item.projectCode === code);
  }
  if (filters.employeeCode) {
    const code = filters.employeeCode.toUpperCase();
    rows = rows.filter((item) => item.employeeCode.toUpperCase() === code);
  }
  if (filters.date) {
    rows = rows.filter((item) => mobilizationCoversDate(item, filters.date as string) && item.status !== 'Cancelled');
  }
  if (filters.status === 'Active') {
    rows = rows.filter((item) => item.status === 'Planned' || item.status === 'Mobilized');
  } else if (filters.status) {
    rows = rows.filter((item) => item.status === filters.status);
  }
  return rows;
}

const rangesOverlap = (startA: string, endA: string | null, startB: string, endB: string | null) => {
  const aEnd = endA || '9999-12-31';
  const bEnd = endB || '9999-12-31';
  return startA <= bEnd && startB <= aEnd;
};

export async function createTimesheetMobilizations(input: CreateMobilizationInput): Promise<TimesheetMobilization[]> {
  const startDate = dateOnly(input.startDate);
  const endDate = input.endDate ? dateOnly(input.endDate) : null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) throw new Error('Start date is required.');
  if (endDate && endDate < startDate) throw new Error('End date cannot be before start date.');
  const projectCode = clean(input.projectCode).toUpperCase();
  if (!projectCode) throw new Error('Project is required.');
  const supervisorId = clean(input.supervisorId);
  if (!supervisorId) throw new Error('Host supervisor is required.');
  const employees = (input.employees?.length
    ? input.employees
    : input.employeeCodes.map((employeeCode) => ({ employeeCode, employeeName: employeeCode, homeWorkCenterName: null }))
  ).filter((item) => clean(item.employeeCode));
  if (!employees.length) throw new Error('Select at least one employee.');

  const workCenterName = offshoreWorkCenterName(projectCode);

  const existing = await readTimesheetMobilizations({ status: 'Active' });
  const created: TimesheetMobilization[] = [];
  const pool = await poolOrThrow();
  const today = new Date().toISOString().slice(0, 10);
  const status: MobilizationStatus = startDate > today ? 'Planned' : 'Mobilized';

  for (const employee of employees) {
    const employeeCode = clean(employee.employeeCode).toUpperCase();
    const clash = existing.find((item) =>
      item.employeeCode.toUpperCase() === employeeCode
      && rangesOverlap(item.startDate, item.endDate, startDate, endDate),
    );
    if (clash) {
      throw new Error(`${employee.employeeName || employeeCode} is already mobilized to ${clash.projectCode} (${clash.supervisorName}) from ${clash.startDate}${clash.endDate ? ` to ${clash.endDate}` : ''}.`);
    }
    const id = `mob-${Date.now()}-${employeeCode}-${Math.random().toString(36).slice(2, 7)}`;
    await pool.request()
      .input('Id', sql.NVarChar(160), id)
      .input('EmployeeCode', sql.NVarChar(80), employeeCode)
      .input('EmployeeName', sql.NVarChar(220), clean(employee.employeeName) || employeeCode)
      .input('HomeWorkCenterName', sql.NVarChar(180), clean(employee.homeWorkCenterName) || null)
      .input('SupervisorId', sql.NVarChar(180), supervisorId)
      .input('SupervisorName', sql.NVarChar(220), clean(input.supervisorName) || supervisorId)
      .input('ProjectCode', sql.NVarChar(50), projectCode)
      .input('ProjectName', sql.NVarChar(255), clean(input.projectName) || projectCode)
      .input('WorkCenterName', sql.NVarChar(180), workCenterName)
      .input('LocationName', sql.NVarChar(180), OFFSHORE_LOCATION_NAME)
      .input('StartDate', sql.Date, startDate)
      .input('EndDate', sql.Date, endDate)
      .input('Status', sql.NVarChar(30), status)
      .input('Reason', sql.NVarChar(500), clean(input.reason) || 'Offshore project mobilization')
      .input('CreatedBy', sql.NVarChar(120), input.actor)
      .query(`
INSERT INTO [hris].[TimesheetMobilizations]
([Id],[EmployeeCode],[EmployeeName],[HomeWorkCenterName],[SupervisorId],[SupervisorName],[ProjectCode],[ProjectName],[WorkCenterName],[LocationName],[StartDate],[EndDate],[Status],[Reason],[CreatedBy])
VALUES (@Id,@EmployeeCode,@EmployeeName,@HomeWorkCenterName,@SupervisorId,@SupervisorName,@ProjectCode,@ProjectName,@WorkCenterName,@LocationName,@StartDate,@EndDate,@Status,@Reason,@CreatedBy)
`);
    created.push({
      id,
      employeeCode,
      employeeName: clean(employee.employeeName) || employeeCode,
      homeWorkCenterName: clean(employee.homeWorkCenterName) || null,
      supervisorId,
      supervisorName: clean(input.supervisorName) || supervisorId,
      projectCode,
      projectName: clean(input.projectName) || projectCode,
      workCenterName,
      locationName: OFFSHORE_LOCATION_NAME,
      startDate,
      endDate,
      status,
      reason: clean(input.reason) || 'Offshore project mobilization',
      createdAt: new Date().toISOString(),
      createdBy: input.actor,
      updatedAt: null,
      updatedBy: null,
    });
  }
  return created;
}

export async function demobilizeTimesheetMobilization(id: string, actor: string, endDate?: string | null) {
  const pool = await poolOrThrow();
  const closeDate = dateOnly(endDate) || new Date().toISOString().slice(0, 10);
  const result = await pool.request()
    .input('Id', sql.NVarChar(160), id)
    .input('EndDate', sql.Date, closeDate)
    .input('UpdatedBy', sql.NVarChar(120), actor)
    .query(`
UPDATE [hris].[TimesheetMobilizations]
SET [Status]=N'Demobilized', [EndDate]=@EndDate, [UpdatedAt]=SYSUTCDATETIME(), [UpdatedBy]=@UpdatedBy
WHERE [Id]=@Id AND [Status] IN (N'Planned', N'Mobilized')
`);
  if (!result.rowsAffected[0]) throw new Error('Mobilization was not found or is already closed.');
}

export async function cancelTimesheetMobilization(id: string, actor: string) {
  const pool = await poolOrThrow();
  const result = await pool.request()
    .input('Id', sql.NVarChar(160), id)
    .input('UpdatedBy', sql.NVarChar(120), actor)
    .query(`
UPDATE [hris].[TimesheetMobilizations]
SET [Status]=N'Cancelled', [UpdatedAt]=SYSUTCDATETIME(), [UpdatedBy]=@UpdatedBy
WHERE [Id]=@Id AND [Status] IN (N'Planned', N'Mobilized')
`);
  if (!result.rowsAffected[0]) throw new Error('Mobilization was not found or is already closed.');
}
