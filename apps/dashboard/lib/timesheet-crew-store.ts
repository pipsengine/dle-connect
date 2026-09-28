import sql from 'mssql';
import { getDleEnterpriseDbPool } from '@/lib/dle-enterprise-db';

export const CREW_OPERATIONAL_STATUSES = [
  'Active on Crew',
  'Temporarily Not Reporting',
  'Abscondment/No-Show – Pending HR',
  'Returned to Crew',
  'Temporarily Deployed',
  'Transferred/Reassigned',
  'Assignment Ended',
] as const;

export type TimesheetCrewAssignment = {
  id: string;
  employeeCode: string;
  employeeName: string;
  employeeType: string;
  department: string;
  assignmentType: 'Primary' | 'Temporary';
  supervisor: string;
  previousSupervisor: string;
  location: string;
  workCenter: string;
  operationalStatus: string;
  effectiveFrom: string;
  effectiveTo: string;
  reason: string;
  notes: string;
  status: string;
  createdBy: string;
  updatedAt: string;
};

export type TimesheetCrewEvent = {
  id: string;
  assignmentId: string;
  employeeCode: string;
  employeeName: string;
  action: string;
  assignmentType: string;
  previousSupervisor: string;
  newSupervisor: string;
  location: string;
  workCenter: string;
  operationalStatus: string;
  effectiveFrom: string;
  effectiveTo: string;
  reason: string;
  notes: string;
  changedBy: string;
  changedAt: string;
};

const text = (value: unknown) => String(value ?? '').trim();
const dateOnly = (value: unknown) => {
  if (!value) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}-${String(value.getUTCDate()).padStart(2, '0')}`;
  }
  const raw = text(value);
  return /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : '';
};
const newId = () => `crew-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const dayBefore = (iso: string) => {
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
};

let ensured = false;

const pool = async () => {
  const connection = await getDleEnterpriseDbPool();
  if (!connection) throw new Error('DLE Enterprise database is not configured.');
  if (!ensured) {
    await connection.request().query(`
IF SCHEMA_ID(N'tsmgmt') IS NULL EXEC(N'CREATE SCHEMA [tsmgmt]');
IF OBJECT_ID(N'[tsmgmt].[CrewAssignments]', N'U') IS NULL
CREATE TABLE [tsmgmt].[CrewAssignments] (
  [Id] NVARCHAR(40) NOT NULL CONSTRAINT [PK_TsmgmtCrewAssignments] PRIMARY KEY,
  [EmployeeCode] NVARCHAR(80) NOT NULL,
  [EmployeeName] NVARCHAR(220) NOT NULL,
  [EmployeeType] NVARCHAR(80) NULL,
  [Department] NVARCHAR(180) NULL,
  [AssignmentType] NVARCHAR(40) NOT NULL,
  [SupervisorName] NVARCHAR(180) NOT NULL,
  [PreviousSupervisor] NVARCHAR(180) NULL,
  [LocationName] NVARCHAR(180) NULL,
  [WorkCenterName] NVARCHAR(180) NULL,
  [OperationalStatus] NVARCHAR(80) NOT NULL,
  [EffectiveFrom] DATE NOT NULL,
  [EffectiveTo] DATE NULL,
  [Reason] NVARCHAR(500) NULL,
  [Notes] NVARCHAR(500) NULL,
  [Status] NVARCHAR(20) NOT NULL,
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_TsmgmtCrewAssignments_CreatedAt] DEFAULT SYSUTCDATETIME(),
  [CreatedBy] NVARCHAR(120) NULL,
  [UpdatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_TsmgmtCrewAssignments_UpdatedAt] DEFAULT SYSUTCDATETIME(),
  [UpdatedBy] NVARCHAR(120) NULL
);
IF OBJECT_ID(N'[tsmgmt].[CrewAssignmentEvents]', N'U') IS NULL
CREATE TABLE [tsmgmt].[CrewAssignmentEvents] (
  [Id] BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT [PK_TsmgmtCrewAssignmentEvents] PRIMARY KEY,
  [AssignmentId] NVARCHAR(40) NOT NULL,
  [EmployeeCode] NVARCHAR(80) NOT NULL,
  [EmployeeName] NVARCHAR(220) NOT NULL,
  [Action] NVARCHAR(40) NOT NULL,
  [AssignmentType] NVARCHAR(40) NULL,
  [PreviousSupervisor] NVARCHAR(180) NULL,
  [NewSupervisor] NVARCHAR(180) NULL,
  [LocationName] NVARCHAR(180) NULL,
  [WorkCenterName] NVARCHAR(180) NULL,
  [OperationalStatus] NVARCHAR(80) NULL,
  [EffectiveFrom] DATE NULL,
  [EffectiveTo] DATE NULL,
  [Reason] NVARCHAR(500) NULL,
  [Notes] NVARCHAR(500) NULL,
  [ChangedBy] NVARCHAR(120) NOT NULL,
  [ChangedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_TsmgmtCrewAssignmentEvents_ChangedAt] DEFAULT SYSUTCDATETIME()
);
IF OBJECT_ID(N'[tsmgmt].[CrewRemovalRequests]', N'U') IS NULL
CREATE TABLE [tsmgmt].[CrewRemovalRequests] (
  [Id] NVARCHAR(40) NOT NULL CONSTRAINT [PK_TsmgmtCrewRemovalRequests] PRIMARY KEY,
  [EmployeeCode] NVARCHAR(80) NOT NULL,
  [EmployeeName] NVARCHAR(220) NOT NULL,
  [SupervisorName] NVARCHAR(180) NOT NULL,
  [RequestReason] NVARCHAR(500) NOT NULL,
  [Status] NVARCHAR(30) NOT NULL,
  [RequestedBy] NVARCHAR(120) NULL,
  [RequestedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_TsmgmtCrewRemovalRequests_RequestedAt] DEFAULT SYSUTCDATETIME(),
  [HrReason] NVARCHAR(500) NULL,
  [DecidedBy] NVARCHAR(120) NULL,
  [DecidedAt] DATETIME2(0) NULL
);
IF COL_LENGTH(N'tsmgmt.CrewAssignments', N'PersonId') IS NULL
  ALTER TABLE [tsmgmt].[CrewAssignments] ADD [PersonId] NVARCHAR(80) NULL;
`);
    ensured = true;
  }
  return connection;
};

export const readCrewSignals = async (onDate: string) => {
  const day = dateOnly(onDate);
  if (!day) return { leave: [] as string[], offshore: [] as Array<{ code: string; reference: string; site: string }> };
  const connection = await pool();
  let leave: string[] = [];
  try {
    const result = await connection.request().input('Day', sql.Date, day).query(`
      SELECT [EmployeeId] FROM [hris].[LeaveApplications]
      WHERE [StatusName] LIKE N'%Approved%' AND [StartDate] <= @Day AND [EndDate] >= @Day
    `);
    leave = (result.recordset || []).map((row) => text(row.EmployeeId).toUpperCase());
  } catch {
    leave = [];
  }
  let offshore: Array<{ code: string; reference: string; site: string }> = [];
  try {
    const result = await connection.request().input('Day', sql.Date, day).query(`
      SELECT e.[EmployeeCode], h.[MobilizationNo], h.[OffshoreSite]
      FROM [tsmgmt].[MobilizationEmployees] e
      INNER JOIN [tsmgmt].[Mobilizations] h ON h.[Id] = e.[MobilizationId]
      WHERE e.[Status] IN (N'Planned', N'Mobilized', N'Extended')
        AND e.[EffectiveFrom] <= @Day
        AND (e.[ActualReturn] IS NULL OR e.[ActualReturn] >= @Day)
        AND (e.[ActualDemobilization] IS NULL OR e.[ActualDemobilization] >= @Day)
    `);
    offshore = (result.recordset || []).map((row) => ({ code: text(row.EmployeeCode).toUpperCase(), reference: text(row.MobilizationNo), site: text(row.OffshoreSite) }));
  } catch {
    offshore = [];
  }
  return { leave, offshore };
};

const mapAssignment = (row: Record<string, unknown>): TimesheetCrewAssignment => ({
  id: text(row.Id),
  employeeCode: text(row.EmployeeCode),
  employeeName: text(row.EmployeeName),
  employeeType: text(row.EmployeeType),
  department: text(row.Department),
  assignmentType: text(row.AssignmentType) === 'Temporary' ? 'Temporary' : 'Primary',
  supervisor: text(row.SupervisorName),
  previousSupervisor: text(row.PreviousSupervisor),
  location: text(row.LocationName),
  workCenter: text(row.WorkCenterName),
  operationalStatus: text(row.OperationalStatus),
  effectiveFrom: dateOnly(row.EffectiveFrom),
  effectiveTo: dateOnly(row.EffectiveTo),
  reason: text(row.Reason),
  notes: text(row.Notes),
  status: text(row.Status),
  createdBy: text(row.CreatedBy),
  updatedAt: row.UpdatedAt ? new Date(String(row.UpdatedAt)).toISOString() : '',
});

const mapEvent = (row: Record<string, unknown>): TimesheetCrewEvent => ({
  id: text(row.Id),
  assignmentId: text(row.AssignmentId),
  employeeCode: text(row.EmployeeCode),
  employeeName: text(row.EmployeeName),
  action: text(row.Action),
  assignmentType: text(row.AssignmentType),
  previousSupervisor: text(row.PreviousSupervisor),
  newSupervisor: text(row.NewSupervisor),
  location: text(row.LocationName),
  workCenter: text(row.WorkCenterName),
  operationalStatus: text(row.OperationalStatus),
  effectiveFrom: dateOnly(row.EffectiveFrom),
  effectiveTo: dateOnly(row.EffectiveTo),
  reason: text(row.Reason),
  notes: text(row.Notes),
  changedBy: text(row.ChangedBy),
  changedAt: row.ChangedAt ? new Date(String(row.ChangedAt)).toISOString() : '',
});

const covers = (row: TimesheetCrewAssignment, onDate: string) => row.status === 'Active' && row.effectiveFrom <= onDate && (!row.effectiveTo || row.effectiveTo >= onDate);

const closeExpiredTemporary = async (connection: sql.ConnectionPool) => {
  const expired = await connection.request().query(`
    UPDATE [tsmgmt].[CrewAssignments]
    SET [Status] = N'Closed', [OperationalStatus] = N'Returned to Crew', [UpdatedAt] = SYSUTCDATETIME(), [UpdatedBy] = N'System'
    OUTPUT inserted.[Id], inserted.[EmployeeCode], inserted.[EmployeeName], inserted.[SupervisorName], inserted.[LocationName], inserted.[WorkCenterName], inserted.[EffectiveFrom], inserted.[EffectiveTo], inserted.[Reason]
    WHERE [AssignmentType] = N'Temporary' AND [Status] = N'Active' AND [EffectiveTo] IS NOT NULL AND [EffectiveTo] < CAST(SYSUTCDATETIME() AS DATE)
  `);
  for (const row of expired.recordset || []) {
    await connection.request()
      .input('AssignmentId', sql.NVarChar(40), text(row.Id))
      .input('EmployeeCode', sql.NVarChar(80), text(row.EmployeeCode))
      .input('EmployeeName', sql.NVarChar(220), text(row.EmployeeName))
      .input('Supervisor', sql.NVarChar(180), text(row.SupervisorName))
      .input('Location', sql.NVarChar(180), text(row.LocationName))
      .input('WorkCenter', sql.NVarChar(180), text(row.WorkCenterName))
      .input('EffectiveFrom', sql.Date, dateOnly(row.EffectiveFrom) || null)
      .input('EffectiveTo', sql.Date, dateOnly(row.EffectiveTo) || null)
      .input('Reason', sql.NVarChar(500), text(row.Reason))
      .query(`
        INSERT INTO [tsmgmt].[CrewAssignmentEvents] (
          [AssignmentId],[EmployeeCode],[EmployeeName],[Action],[AssignmentType],[PreviousSupervisor],[NewSupervisor],
          [LocationName],[WorkCenterName],[OperationalStatus],[EffectiveFrom],[EffectiveTo],[Reason],[Notes],[ChangedBy]
        ) VALUES (
          @AssignmentId,@EmployeeCode,@EmployeeName,N'Temporary ended',N'Temporary',@Supervisor,N'',
          @Location,@WorkCenter,N'Returned to Crew',@EffectiveFrom,@EffectiveTo,@Reason,N'Home crew applies again.',N'System'
        )
      `);
  }
};

export type TimesheetCrewRemoval = {
  id: string;
  employeeCode: string;
  employeeName: string;
  supervisor: string;
  requestReason: string;
  status: string;
  requestedBy: string;
  requestedAt: string;
  hrReason: string;
  decidedBy: string;
  decidedAt: string;
};

const mapRemoval = (row: Record<string, unknown>): TimesheetCrewRemoval => ({
  id: text(row.Id),
  employeeCode: text(row.EmployeeCode),
  employeeName: text(row.EmployeeName),
  supervisor: text(row.SupervisorName),
  requestReason: text(row.RequestReason),
  status: text(row.Status),
  requestedBy: text(row.RequestedBy),
  requestedAt: row.RequestedAt ? new Date(String(row.RequestedAt)).toISOString() : '',
  hrReason: text(row.HrReason),
  decidedBy: text(row.DecidedBy),
  decidedAt: row.DecidedAt ? new Date(String(row.DecidedAt)).toISOString() : '',
});

export const namesMatchSupervisor = (left: string, right: string) => {
  const a = text(left).toLowerCase();
  const b = text(right).toLowerCase();
  if (!a || !b || a === '—' || b === '—' || a === 'unassigned' || b === 'unassigned') return false;
  return a === b || a.includes(b) || b.includes(a);
};

export const readTimesheetCrewState = async () => {
  const connection = await pool();
  await closeExpiredTemporary(connection);
  const [assignments, events, removals] = await Promise.all([
    connection.request().query(`SELECT * FROM [tsmgmt].[CrewAssignments] ORDER BY [EffectiveFrom] DESC, [EmployeeCode]`),
    connection.request().query(`SELECT TOP 1000 * FROM [tsmgmt].[CrewAssignmentEvents] ORDER BY [ChangedAt] DESC, [Id] DESC`),
    connection.request().query(`SELECT * FROM [tsmgmt].[CrewRemovalRequests] ORDER BY [RequestedAt] DESC`),
  ]);
  return {
    assignments: (assignments.recordset || []).map(mapAssignment),
    events: (events.recordset || []).map(mapEvent),
    removals: (removals.recordset || []).map(mapRemoval),
  };
};

export const confirmedRemovalEmployeeCodes = async (supervisor: string) => {
  const connection = await pool();
  const result = await connection.request().query(`SELECT [EmployeeCode], [SupervisorName] FROM [tsmgmt].[CrewRemovalRequests] WHERE [Status] = N'Confirmed'`);
  return new Set((result.recordset || [])
    .filter((row) => namesMatchSupervisor(text(row.SupervisorName), supervisor))
    .map((row) => text(row.EmployeeCode).toUpperCase()));
};

type DirectoryEmployee = { code: string; name: string; personId: string; employeeType: string; department: string };

const loadEmployees = async (transaction: sql.Transaction, codes: string[]) => {
  const result = await new sql.Request(transaction)
    .input('Codes', sql.NVarChar(sql.MAX), JSON.stringify(codes))
    .query(`
      SELECT v.employee_id, v.employee_code, v.full_name, ISNULL(v.employment_type, N'') AS employment_type, ISNULL(v.department, N'') AS department
      FROM [hris].[EmployeeMasterView] v
      INNER JOIN OPENJSON(@Codes) WITH (code NVARCHAR(80) '$') selected ON selected.code = v.employee_code
      WHERE ISNULL(v.employment_status, N'') NOT LIKE N'%terminated%'
        AND ISNULL(v.employment_status, N'') NOT LIKE N'%resigned%'
        AND ISNULL(v.employment_status, N'') NOT LIKE N'%retired%'
        AND ISNULL(v.employment_status, N'') NOT LIKE N'%inactive%'
    `);
  const found = new Map<string, DirectoryEmployee>();
  for (const row of result.recordset || []) {
    found.set(text(row.employee_code), {
      code: text(row.employee_code),
      name: text(row.full_name),
      personId: text(row.employee_id),
      employeeType: text(row.employment_type),
      department: text(row.department),
    });
  }
  const missing = codes.filter((code) => !found.has(code));
  if (missing.length) throw new Error(`These employees are not in the active directory: ${missing.slice(0, 8).join(', ')}.`);
  return found;
};

const insertEvent = async (transaction: sql.Transaction, event: Omit<TimesheetCrewEvent, 'id' | 'changedAt'>) => {
  await new sql.Request(transaction)
    .input('AssignmentId', sql.NVarChar(40), event.assignmentId)
    .input('EmployeeCode', sql.NVarChar(80), event.employeeCode)
    .input('EmployeeName', sql.NVarChar(220), event.employeeName)
    .input('Action', sql.NVarChar(40), event.action)
    .input('AssignmentType', sql.NVarChar(40), event.assignmentType)
    .input('PreviousSupervisor', sql.NVarChar(180), event.previousSupervisor)
    .input('NewSupervisor', sql.NVarChar(180), event.newSupervisor)
    .input('Location', sql.NVarChar(180), event.location)
    .input('WorkCenter', sql.NVarChar(180), event.workCenter)
    .input('OperationalStatus', sql.NVarChar(80), event.operationalStatus)
    .input('EffectiveFrom', sql.Date, event.effectiveFrom || null)
    .input('EffectiveTo', sql.Date, event.effectiveTo || null)
    .input('Reason', sql.NVarChar(500), event.reason)
    .input('Notes', sql.NVarChar(500), event.notes)
    .input('ChangedBy', sql.NVarChar(120), event.changedBy)
    .query(`
      INSERT INTO [tsmgmt].[CrewAssignmentEvents] (
        [AssignmentId],[EmployeeCode],[EmployeeName],[Action],[AssignmentType],[PreviousSupervisor],[NewSupervisor],
        [LocationName],[WorkCenterName],[OperationalStatus],[EffectiveFrom],[EffectiveTo],[Reason],[Notes],[ChangedBy]
      ) VALUES (
        @AssignmentId,@EmployeeCode,@EmployeeName,@Action,@AssignmentType,@PreviousSupervisor,@NewSupervisor,
        @Location,@WorkCenter,@OperationalStatus,@EffectiveFrom,@EffectiveTo,@Reason,@Notes,@ChangedBy
      )
    `);
};

const insertAssignment = async (transaction: sql.Transaction, row: Omit<TimesheetCrewAssignment, 'updatedAt'> & { personId?: string }) => {
  await new sql.Request(transaction)
    .input('Id', sql.NVarChar(40), row.id)
    .input('EmployeeCode', sql.NVarChar(80), row.employeeCode)
    .input('EmployeeName', sql.NVarChar(220), row.employeeName)
    .input('EmployeeType', sql.NVarChar(80), row.employeeType)
    .input('Department', sql.NVarChar(180), row.department)
    .input('AssignmentType', sql.NVarChar(40), row.assignmentType)
    .input('SupervisorName', sql.NVarChar(180), row.supervisor)
    .input('PreviousSupervisor', sql.NVarChar(180), row.previousSupervisor)
    .input('LocationName', sql.NVarChar(180), row.location)
    .input('WorkCenterName', sql.NVarChar(180), row.workCenter)
    .input('OperationalStatus', sql.NVarChar(80), row.operationalStatus)
    .input('EffectiveFrom', sql.Date, row.effectiveFrom)
    .input('EffectiveTo', sql.Date, row.effectiveTo || null)
    .input('Reason', sql.NVarChar(500), row.reason)
    .input('Notes', sql.NVarChar(500), row.notes)
    .input('Status', sql.NVarChar(20), row.status)
    .input('Actor', sql.NVarChar(120), row.createdBy)
    .input('PersonId', sql.NVarChar(80), text(row.personId))
    .query(`
      INSERT INTO [tsmgmt].[CrewAssignments] (
        [Id],[EmployeeCode],[EmployeeName],[EmployeeType],[Department],[AssignmentType],[SupervisorName],[PreviousSupervisor],
        [LocationName],[WorkCenterName],[OperationalStatus],[EffectiveFrom],[EffectiveTo],[Reason],[Notes],[Status],[CreatedBy],[UpdatedBy],[PersonId]
      ) VALUES (
        @Id,@EmployeeCode,@EmployeeName,@EmployeeType,@Department,@AssignmentType,@SupervisorName,@PreviousSupervisor,
        @LocationName,@WorkCenterName,@OperationalStatus,@EffectiveFrom,@EffectiveTo,@Reason,@Notes,@Status,@Actor,@Actor,@PersonId
      )
    `);
};

export const saveTimesheetCrewAssignment = async (input: {
  employeeCodes: string[];
  supervisor: string;
  location: string;
  workCenter: string;
  effectiveFrom: string;
  effectiveTo?: string;
  assignmentType: 'Primary' | 'Temporary';
  reason: string;
  notes: string;
  actor: string;
}) => {
  const codes = [...new Set((input.employeeCodes || []).map(text).filter(Boolean))];
  const supervisor = text(input.supervisor);
  const location = text(input.location);
  const workCenter = text(input.workCenter);
  const effectiveFrom = dateOnly(input.effectiveFrom);
  const effectiveTo = dateOnly(input.effectiveTo);
  const assignmentType = input.assignmentType === 'Temporary' ? 'Temporary' : 'Primary';
  const reason = text(input.reason);
  const notes = text(input.notes);
  const actor = text(input.actor) || 'Timesheet User';
  if (!codes.length) throw new Error('Select at least one employee.');
  if (!supervisor || !location || !workCenter || !effectiveFrom) throw new Error('Supervisor, location, work centre, and effective date are required.');
  if (!reason) throw new Error('A reason is required.');
  if (assignmentType === 'Temporary' && !effectiveTo) throw new Error('A temporary deployment needs an end date.');
  if (effectiveTo && effectiveTo < effectiveFrom) throw new Error('Effective to must be on or after effective from.');

  const connection = await pool();
  const transaction = new sql.Transaction(connection);
  await transaction.begin();
  try {
    const directory = await loadEmployees(transaction, codes);
    const existingResult = await new sql.Request(transaction)
      .input('Codes', sql.NVarChar(sql.MAX), JSON.stringify(codes))
      .query(`
        SELECT * FROM [tsmgmt].[CrewAssignments]
        WHERE [Status] = N'Active' AND [EmployeeCode] IN (SELECT code FROM OPENJSON(@Codes) WITH (code NVARCHAR(80) '$'))
      `);
    const existing = (existingResult.recordset || []).map(mapAssignment);
    let created = 0;
    let closed = 0;
    let skipped = 0;
    for (const code of codes) {
      const employee = directory.get(code)!;
      const sameType = existing.filter((row) => row.employeeCode === code && row.assignmentType === assignmentType);
      const current = sameType.find((row) => covers(row, effectiveFrom));
      if (assignmentType === 'Primary' && current && current.supervisor === supervisor && current.location === location && current.workCenter === workCenter && !current.effectiveTo) {
        skipped += 1;
        continue;
      }
      if (assignmentType === 'Temporary' && sameType.some((row) => covers(row, effectiveFrom) || (effectiveTo && row.effectiveFrom <= effectiveTo && (!row.effectiveTo || row.effectiveTo >= effectiveFrom)))) {
        throw new Error(`${employee.name} already has a temporary deployment covering these dates.`);
      }
      let previousSupervisor = '';
      if (assignmentType === 'Primary') {
        for (const row of sameType) {
          const overlaps = row.effectiveFrom <= (effectiveTo || '9999-12-31') && (!row.effectiveTo || row.effectiveTo >= effectiveFrom);
          if (!overlaps) continue;
          previousSupervisor = row.supervisor;
          const closeOn = row.effectiveFrom < effectiveFrom ? dayBefore(effectiveFrom) : row.effectiveFrom;
          await new sql.Request(transaction)
            .input('Id', sql.NVarChar(40), row.id)
            .input('EffectiveTo', sql.Date, closeOn)
            .input('Actor', sql.NVarChar(120), actor)
            .query(`
              UPDATE [tsmgmt].[CrewAssignments]
              SET [Status] = N'Closed', [OperationalStatus] = N'Transferred/Reassigned', [EffectiveTo] = @EffectiveTo,
                  [UpdatedAt] = SYSUTCDATETIME(), [UpdatedBy] = @Actor
              WHERE [Id] = @Id AND [Status] = N'Active'
            `);
          await insertEvent(transaction, {
            assignmentId: row.id,
            employeeCode: code,
            employeeName: employee.name,
            action: 'Closed',
            assignmentType: 'Primary',
            previousSupervisor: row.supervisor,
            newSupervisor: supervisor,
            location: row.location,
            workCenter: row.workCenter,
            operationalStatus: 'Transferred/Reassigned',
            effectiveFrom: row.effectiveFrom,
            effectiveTo: closeOn,
            reason,
            notes,
            changedBy: actor,
          });
          closed += 1;
        }
      }
      const assignmentId = newId();
      const statusName = assignmentType === 'Temporary' ? 'Temporarily Deployed' : 'Active on Crew';
      await insertAssignment(transaction, {
        id: assignmentId,
        employeeCode: code,
        employeeName: employee.name,
        employeeType: employee.employeeType,
        department: employee.department,
        personId: employee.personId,
        assignmentType,
        supervisor,
        previousSupervisor,
        location,
        workCenter,
        operationalStatus: statusName,
        effectiveFrom,
        effectiveTo: assignmentType === 'Temporary' ? effectiveTo : '',
        reason,
        notes,
        status: 'Active',
        createdBy: actor,
      });
      await insertEvent(transaction, {
        assignmentId,
        employeeCode: code,
        employeeName: employee.name,
        action: assignmentType === 'Temporary' ? 'Temporary deployment' : previousSupervisor ? 'Reassigned' : 'Assigned',
        assignmentType,
        previousSupervisor,
        newSupervisor: supervisor,
        location,
        workCenter,
        operationalStatus: statusName,
        effectiveFrom,
        effectiveTo: assignmentType === 'Temporary' ? effectiveTo : '',
        reason,
        notes,
        changedBy: actor,
      });
      created += 1;
    }
    await transaction.commit();
    return { created, closed, skipped };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

export const updateTimesheetCrewStatus = async (input: {
  employeeCodes: string[];
  operationalStatus: string;
  effectiveFrom: string;
  effectiveTo?: string;
  reason: string;
  notes: string;
  actor: string;
}) => {
  const codes = [...new Set((input.employeeCodes || []).map(text).filter(Boolean))];
  const operationalStatus = text(input.operationalStatus);
  const effectiveFrom = dateOnly(input.effectiveFrom);
  const effectiveTo = dateOnly(input.effectiveTo);
  const reason = text(input.reason);
  const actor = text(input.actor) || 'Timesheet User';
  if (!codes.length) throw new Error('Select at least one crew member.');
  if (!CREW_OPERATIONAL_STATUSES.includes(operationalStatus as typeof CREW_OPERATIONAL_STATUSES[number])) throw new Error('Choose an operational status. Employment termination is not available here.');
  if (!effectiveFrom) throw new Error('Effective from is required.');
  if (!reason) throw new Error('A reason is required.');
  if (effectiveTo && effectiveTo < effectiveFrom) throw new Error('Effective to must be on or after effective from.');
  const connection = await pool();
  const transaction = new sql.Transaction(connection);
  await transaction.begin();
  try {
    const directory = await loadEmployees(transaction, codes);
    const existingResult = await new sql.Request(transaction)
      .input('Codes', sql.NVarChar(sql.MAX), JSON.stringify(codes))
      .query(`SELECT * FROM [tsmgmt].[CrewAssignments] WHERE [Status] = N'Active' AND [AssignmentType] = N'Primary' AND [EmployeeCode] IN (SELECT code FROM OPENJSON(@Codes) WITH (code NVARCHAR(80) '$'))`);
    const existing = (existingResult.recordset || []).map(mapAssignment);
    let updated = 0;
    for (const code of codes) {
      const current = existing.find((row) => row.employeeCode === code && covers(row, effectiveFrom));
      if (!current) throw new Error(`${directory.get(code)?.name || code} has no active home crew on ${effectiveFrom}.`);
      await new sql.Request(transaction)
        .input('Id', sql.NVarChar(40), current.id)
        .input('OperationalStatus', sql.NVarChar(80), operationalStatus)
        .input('Reason', sql.NVarChar(500), reason)
        .input('Notes', sql.NVarChar(500), text(input.notes))
        .input('Actor', sql.NVarChar(120), actor)
        .query(`
          UPDATE [tsmgmt].[CrewAssignments]
          SET [OperationalStatus] = @OperationalStatus, [Reason] = @Reason, [Notes] = @Notes, [UpdatedAt] = SYSUTCDATETIME(), [UpdatedBy] = @Actor
          WHERE [Id] = @Id
        `);
      await insertEvent(transaction, {
        assignmentId: current.id,
        employeeCode: code,
        employeeName: current.employeeName,
        action: 'Operational status',
        assignmentType: 'Primary',
        previousSupervisor: current.supervisor,
        newSupervisor: current.supervisor,
        location: current.location,
        workCenter: current.workCenter,
        operationalStatus,
        effectiveFrom,
        effectiveTo,
        reason,
        notes: text(input.notes),
        changedBy: actor,
      });
      updated += 1;
    }
    await transaction.commit();
    return { updated };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

const onSupervisorCrew = async (transaction: sql.Transaction, code: string, supervisor: string) => {
  const reporting = await new sql.Request(transaction)
    .input('Code', sql.NVarChar(80), code)
    .query(`SELECT TOP 1 ISNULL([reporting_manager], N'') AS reporting_manager FROM [hris].[EmployeeMasterView] WHERE [employee_code] = @Code`);
  if (namesMatchSupervisor(text(reporting.recordset?.[0]?.reporting_manager), supervisor)) return true;
  const assignments = await new sql.Request(transaction)
    .input('Code', sql.NVarChar(80), code)
    .query(`SELECT [SupervisorName] FROM [tsmgmt].[CrewAssignments] WHERE [EmployeeCode] = @Code AND [Status] = N'Active'`);
  return (assignments.recordset || []).some((row) => namesMatchSupervisor(text(row.SupervisorName), supervisor));
};

export const requestCrewRemoval = async (input: { employees: Array<{ code: string; supervisor: string }>; reason: string; actor: string }) => {
  const reason = text(input.reason);
  const actor = text(input.actor) || 'Timesheet User';
  const employees = (input.employees || []).map((item) => ({ code: text(item.code), supervisor: text(item.supervisor) })).filter((item) => item.code && item.supervisor);
  if (!employees.length) throw new Error('Select an employee who is on a supervisor crew.');
  if (!reason) throw new Error('A reason is required before HR can review the removal.');
  const connection = await pool();
  const transaction = new sql.Transaction(connection);
  await transaction.begin();
  try {
    const directory = await loadEmployees(transaction, employees.map((item) => item.code));
    let requested = 0;
    for (const item of employees) {
      if (!(await onSupervisorCrew(transaction, item.code, item.supervisor))) throw new Error(`${item.code} is not on that supervisor's crew.`);
      const pending = await new sql.Request(transaction)
        .input('Code', sql.NVarChar(80), item.code)
        .input('Supervisor', sql.NVarChar(180), item.supervisor)
        .query(`SELECT TOP 1 [Id] FROM [tsmgmt].[CrewRemovalRequests] WHERE [EmployeeCode] = @Code AND [SupervisorName] = @Supervisor AND [Status] = N'Pending HR'`);
      if (pending.recordset?.[0]) continue;
      const person = directory.get(item.code);
      await new sql.Request(transaction)
        .input('Id', sql.NVarChar(40), newId())
        .input('EmployeeCode', sql.NVarChar(80), item.code)
        .input('EmployeeName', sql.NVarChar(220), person?.name || item.code)
        .input('Supervisor', sql.NVarChar(180), item.supervisor)
        .input('Reason', sql.NVarChar(500), reason)
        .input('Actor', sql.NVarChar(120), actor)
        .query(`
          INSERT INTO [tsmgmt].[CrewRemovalRequests] ([Id],[EmployeeCode],[EmployeeName],[SupervisorName],[RequestReason],[Status],[RequestedBy])
          VALUES (@Id,@EmployeeCode,@EmployeeName,@Supervisor,@Reason,N'Pending HR',@Actor)
        `);
      requested += 1;
    }
    await transaction.commit();
    return { requested };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

export const decideCrewRemoval = async (input: { id: string; decision: 'confirm' | 'reject'; hrReason: string; actor: string }) => {
  const id = text(input.id);
  const hrReason = text(input.hrReason);
  const actor = text(input.actor) || 'HR Manager';
  const status = input.decision === 'confirm' ? 'Confirmed' : 'Rejected';
  if (!id) throw new Error('Choose a removal request.');
  if (!hrReason) throw new Error('HR confirmation needs a reason.');
  const connection = await pool();
  const transaction = new sql.Transaction(connection);
  await transaction.begin();
  try {
    const current = await new sql.Request(transaction).input('Id', sql.NVarChar(40), id).query(`SELECT * FROM [tsmgmt].[CrewRemovalRequests] WHERE [Id] = @Id`);
    const request = current.recordset?.[0];
    if (!request) throw new Error('Removal request was not found.');
    if (text(request.Status) !== 'Pending HR') throw new Error('This removal request has already been decided.');
    await new sql.Request(transaction)
      .input('Id', sql.NVarChar(40), id)
      .input('Status', sql.NVarChar(30), status)
      .input('HrReason', sql.NVarChar(500), hrReason)
      .input('Actor', sql.NVarChar(120), actor)
      .query(`UPDATE [tsmgmt].[CrewRemovalRequests] SET [Status]=@Status, [HrReason]=@HrReason, [DecidedBy]=@Actor, [DecidedAt]=SYSUTCDATETIME() WHERE [Id]=@Id`);
    if (status === 'Confirmed') {
      const assignments = await new sql.Request(transaction)
        .input('Code', sql.NVarChar(80), text(request.EmployeeCode))
        .query(`SELECT * FROM [tsmgmt].[CrewAssignments] WHERE [EmployeeCode] = @Code AND [Status] = N'Active'`);
      for (const row of assignments.recordset || []) {
        if (!namesMatchSupervisor(text(row.SupervisorName), text(request.SupervisorName))) continue;
        await new sql.Request(transaction)
          .input('Id', sql.NVarChar(40), text(row.Id))
          .input('Actor', sql.NVarChar(120), actor)
          .query(`UPDATE [tsmgmt].[CrewAssignments] SET [Status]=N'Closed', [OperationalStatus]=N'Assignment Ended', [EffectiveTo]=CAST(SYSUTCDATETIME() AS DATE), [UpdatedAt]=SYSUTCDATETIME(), [UpdatedBy]=@Actor WHERE [Id]=@Id`);
        await insertEvent(transaction, {
          assignmentId: text(row.Id),
          employeeCode: text(request.EmployeeCode),
          employeeName: text(request.EmployeeName),
          action: 'Removal confirmed',
          assignmentType: text(row.AssignmentType) === 'Temporary' ? 'Temporary' : 'Primary',
          previousSupervisor: text(row.SupervisorName),
          newSupervisor: '',
          location: text(row.LocationName),
          workCenter: text(row.WorkCenterName),
          operationalStatus: 'Assignment Ended',
          effectiveFrom: dateOnly(row.EffectiveFrom),
          effectiveTo: new Date().toISOString().slice(0, 10),
          reason: hrReason,
          notes: text(request.RequestReason),
          changedBy: actor,
        });
      }
    }
    await transaction.commit();
    return { status };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};
