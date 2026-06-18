import sql from 'mssql';

import { getDleEnterpriseDbPool } from '@/lib/dle-enterprise-db';

export type SupervisorAssignmentRow = {
  assignmentId: number;
  assignmentBatch: string;
  assignmentGroup: string;
  sourceLabel: string;
  supervisorEmployeeId: number | null;
  supervisorEmployeeCode: string | null;
  supervisorName: string | null;
  employeeId: number | null;
  employeeCode: string | null;
  employeeName: string | null;
  tradeRole: string | null;
  matchedStatus: string;
  matchConfidence: string | null;
  matchNote: string | null;
  previousReportingManager: string | null;
  newReportingManager: string | null;
  assignedAt: string;
  assignedBy: string;
};

export type AssignEmployeesToSupervisorInput = {
  supervisorEmployeeCode: string;
  employeeCodes: string[];
  assignmentBatch?: string;
  assignmentGroup?: string;
  reason?: string;
  performedBy?: string;
  sourceRows?: Array<{
    employeeCode?: string | null;
    sourceLabel?: string | null;
    tradeRole?: string | null;
    matchConfidence?: string | null;
    matchNote?: string | null;
  }>;
};

const clean = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
const nullable = (value: unknown) => clean(value) || null;
const nowBatch = () => `supervisor-assignment-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`;

const ensureSupervisorAssignmentTable = async (request: sql.Request) => {
  await request.query(`
IF OBJECT_ID(N'[hris].[SupervisorEmployeeAssignments]', N'U') IS NULL
BEGIN
  CREATE TABLE [hris].[SupervisorEmployeeAssignments] (
    assignment_id bigint IDENTITY(1,1) NOT NULL,
    assignment_batch nvarchar(120) NOT NULL,
    assignment_group nvarchar(120) NOT NULL,
    source_label nvarchar(250) NOT NULL,
    supervisor_employee_id bigint NULL,
    supervisor_employee_code nvarchar(50) NULL,
    supervisor_name nvarchar(250) NULL,
    employee_id bigint NULL,
    employee_code nvarchar(50) NULL,
    employee_name nvarchar(250) NULL,
    trade_role nvarchar(250) NULL,
    matched_status nvarchar(40) NOT NULL,
    match_confidence nvarchar(40) NULL,
    match_note nvarchar(500) NULL,
    previous_reporting_manager nvarchar(250) NULL,
    new_reporting_manager nvarchar(250) NULL,
    assigned_at datetime2(0) NOT NULL CONSTRAINT DF_SupervisorEmployeeAssignments_assigned_at DEFAULT SYSUTCDATETIME(),
    assigned_by sysname NOT NULL CONSTRAINT DF_SupervisorEmployeeAssignments_assigned_by DEFAULT SUSER_SNAME(),
    row_version rowversion NOT NULL,
    CONSTRAINT PK_SupervisorEmployeeAssignments PRIMARY KEY CLUSTERED (assignment_id)
  );

  CREATE UNIQUE INDEX UX_SupervisorEmployeeAssignments_BatchSource
    ON [hris].[SupervisorEmployeeAssignments](assignment_batch, source_label);
END;
`);
};

const employeeDisplayName = (row: any) =>
  [row.first_name, row.middle_name, row.last_name].map(clean).filter(Boolean).join(' ') || clean(row.full_name) || clean(row.employee_code);

const mapAssignmentRow = (row: any): SupervisorAssignmentRow => ({
  assignmentId: Number(row.assignment_id),
  assignmentBatch: clean(row.assignment_batch),
  assignmentGroup: clean(row.assignment_group),
  sourceLabel: clean(row.source_label),
  supervisorEmployeeId: row.supervisor_employee_id == null ? null : Number(row.supervisor_employee_id),
  supervisorEmployeeCode: clean(row.supervisor_employee_code) || null,
  supervisorName: clean(row.supervisor_name) || null,
  employeeId: row.employee_id == null ? null : Number(row.employee_id),
  employeeCode: clean(row.employee_code) || null,
  employeeName: clean(row.employee_name) || null,
  tradeRole: clean(row.trade_role) || null,
  matchedStatus: clean(row.matched_status),
  matchConfidence: clean(row.match_confidence) || null,
  matchNote: clean(row.match_note) || null,
  previousReportingManager: clean(row.previous_reporting_manager) || null,
  newReportingManager: clean(row.new_reporting_manager) || null,
  assignedAt: row.assigned_at instanceof Date ? row.assigned_at.toISOString() : clean(row.assigned_at),
  assignedBy: clean(row.assigned_by),
});

const readEmployeeByCode = async (tx: sql.Transaction, employeeCode: string) => {
  const result = await new sql.Request(tx)
    .input('employee_code', sql.NVarChar(50), employeeCode)
    .query(`
SELECT TOP 1 e.employee_id, e.employee_code, e.full_name, e.employment_status,
       p.first_name, p.middle_name, p.last_name,
       j.reporting_manager, j.job_title
FROM [hris].[Employees] e
LEFT JOIN [hris].[EmployeePersonalInfo] p ON p.employee_id = e.employee_id
LEFT JOIN [hris].[EmployeeJobInfo] j ON j.employee_id = e.employee_id
WHERE e.employee_code = @employee_code
ORDER BY e.employee_id;
`);
  return result.recordset[0] || null;
};

const upsertAssignmentRecord = async (tx: sql.Transaction, values: Record<string, unknown>) => {
  await new sql.Request(tx)
    .input('assignment_batch', sql.NVarChar(120), values.assignmentBatch)
    .input('assignment_group', sql.NVarChar(120), values.assignmentGroup)
    .input('source_label', sql.NVarChar(250), values.sourceLabel)
    .input('supervisor_employee_id', sql.BigInt, values.supervisorEmployeeId)
    .input('supervisor_employee_code', sql.NVarChar(50), values.supervisorEmployeeCode)
    .input('supervisor_name', sql.NVarChar(250), values.supervisorName)
    .input('employee_id', sql.BigInt, values.employeeId)
    .input('employee_code', sql.NVarChar(50), values.employeeCode)
    .input('employee_name', sql.NVarChar(250), values.employeeName)
    .input('trade_role', sql.NVarChar(250), values.tradeRole)
    .input('matched_status', sql.NVarChar(40), values.matchedStatus)
    .input('match_confidence', sql.NVarChar(40), values.matchConfidence)
    .input('match_note', sql.NVarChar(500), values.matchNote)
    .input('previous_reporting_manager', sql.NVarChar(250), values.previousReportingManager)
    .input('new_reporting_manager', sql.NVarChar(250), values.newReportingManager)
    .input('assigned_by', sql.NVarChar(128), values.assignedBy)
    .query(`
MERGE [hris].[SupervisorEmployeeAssignments] AS target
USING (SELECT @assignment_batch AS assignment_batch, @source_label AS source_label) AS source
ON target.assignment_batch = source.assignment_batch AND target.source_label = source.source_label
WHEN MATCHED THEN UPDATE SET
  assignment_group = @assignment_group,
  supervisor_employee_id = @supervisor_employee_id,
  supervisor_employee_code = @supervisor_employee_code,
  supervisor_name = @supervisor_name,
  employee_id = @employee_id,
  employee_code = @employee_code,
  employee_name = @employee_name,
  trade_role = @trade_role,
  matched_status = @matched_status,
  match_confidence = @match_confidence,
  match_note = @match_note,
  previous_reporting_manager = @previous_reporting_manager,
  new_reporting_manager = @new_reporting_manager,
  assigned_at = SYSUTCDATETIME(),
  assigned_by = @assigned_by
WHEN NOT MATCHED THEN INSERT (
  assignment_batch, assignment_group, source_label, supervisor_employee_id, supervisor_employee_code,
  supervisor_name, employee_id, employee_code, employee_name, trade_role, matched_status,
  match_confidence, match_note, previous_reporting_manager, new_reporting_manager, assigned_by
) VALUES (
  @assignment_batch, @assignment_group, @source_label, @supervisor_employee_id, @supervisor_employee_code,
  @supervisor_name, @employee_id, @employee_code, @employee_name, @trade_role, @matched_status,
  @match_confidence, @match_note, @previous_reporting_manager, @new_reporting_manager, @assigned_by
);
`);
};

export async function readSupervisorAssignments(filters: { assignmentBatch?: string; supervisorEmployeeCode?: string } = {}) {
  const pool = await getDleEnterpriseDbPool();
  if (!pool) throw new Error('DLE Enterprise database is not configured.');
  await ensureSupervisorAssignmentTable(pool.request());
  const request = pool.request()
    .input('assignment_batch', sql.NVarChar(120), nullable(filters.assignmentBatch))
    .input('supervisor_employee_code', sql.NVarChar(50), nullable(filters.supervisorEmployeeCode));
  const result = await request.query(`
SELECT TOP 1000 *
FROM [hris].[SupervisorEmployeeAssignments]
WHERE (@assignment_batch IS NULL OR assignment_batch = @assignment_batch)
  AND (@supervisor_employee_code IS NULL OR supervisor_employee_code = @supervisor_employee_code)
ORDER BY assigned_at DESC, assignment_id DESC;
`);
  return result.recordset.map(mapAssignmentRow);
}

export async function assignEmployeesToSupervisor(input: AssignEmployeesToSupervisorInput) {
  const supervisorEmployeeCode = clean(input.supervisorEmployeeCode);
  const employeeCodes = Array.from(new Set(input.employeeCodes.map(clean).filter(Boolean))).filter((code) => code !== supervisorEmployeeCode);
  if (!supervisorEmployeeCode) throw new Error('Supervisor employee code is required.');
  if (!employeeCodes.length) throw new Error('At least one employee code is required.');

  const pool = await getDleEnterpriseDbPool();
  if (!pool) throw new Error('DLE Enterprise database is not configured.');
  const tx = new sql.Transaction(pool);
  let committed = false;
  await tx.begin();

  try {
    await ensureSupervisorAssignmentTable(new sql.Request(tx));

    const supervisor = await readEmployeeByCode(tx, supervisorEmployeeCode);
    if (!supervisor) throw new Error(`Supervisor ${supervisorEmployeeCode} was not found in the employee database.`);
    if (/inactive|terminated|resigned|retired|deceased/i.test(clean(supervisor.employment_status))) {
      throw new Error(`Supervisor ${supervisorEmployeeCode} is not active.`);
    }

    const assignmentBatch = clean(input.assignmentBatch) || nowBatch();
    const assignmentGroup = clean(input.assignmentGroup) || 'Reporting Line';
    const performedBy = clean(input.performedBy) || 'system';
    const reason = clean(input.reason) || 'Supervisor assignment updated from application.';
    const supervisorLabel = `${clean(supervisor.employee_code)} - ${clean(supervisor.full_name)}`;
    const supervisorName = employeeDisplayName(supervisor);
    const sourceByCode = new Map((input.sourceRows || []).map((row) => [clean(row.employeeCode), row]));
    await new sql.Request(tx)
      .input('employee_id', sql.BigInt, supervisor.employee_id)
      .query(`
MERGE [hris].[EmployeeJobInfo] AS target
USING (SELECT @employee_id AS employee_id) AS source
ON target.employee_id = source.employee_id
WHEN MATCHED THEN UPDATE SET is_people_manager = 1, modified_at = SYSUTCDATETIME()
WHEN NOT MATCHED THEN INSERT (employee_id, is_people_manager, is_budget_owner)
VALUES (@employee_id, 1, 0);
`);

    for (const employeeCode of employeeCodes) {
      const source = sourceByCode.get(employeeCode);
      const employee = await readEmployeeByCode(tx, employeeCode);
      const previousReportingManager = clean(employee?.reporting_manager) || null;
      const matchedStatus = employee ? 'Matched' : 'Unresolved';
      const employeeName = employee ? employeeDisplayName(employee) : null;
      const sourceLabel = clean(source?.sourceLabel) || employeeName || employeeCode;
      const newReportingManager = employee ? supervisorLabel : null;

      await upsertAssignmentRecord(tx, {
        assignmentBatch,
        assignmentGroup,
        sourceLabel,
        supervisorEmployeeId: supervisor.employee_id,
        supervisorEmployeeCode: supervisor.employee_code,
        supervisorName,
        employeeId: employee?.employee_id || null,
        employeeCode,
        employeeName,
        tradeRole: nullable(source?.tradeRole),
        matchedStatus,
        matchConfidence: nullable(source?.matchConfidence) || (employee ? 'DirectEmployeeCode' : 'Unresolved'),
        matchNote: nullable(source?.matchNote),
        previousReportingManager,
        newReportingManager,
        assignedBy: performedBy,
      });

      if (employee) {
        await new sql.Request(tx)
          .input('employee_id', sql.BigInt, employee.employee_id)
          .input('reporting_manager', sql.NVarChar(250), supervisorLabel)
          .query(`
MERGE [hris].[EmployeeJobInfo] AS target
USING (SELECT @employee_id AS employee_id) AS source
ON target.employee_id = source.employee_id
WHEN MATCHED THEN UPDATE SET reporting_manager = @reporting_manager, modified_at = SYSUTCDATETIME()
WHEN NOT MATCHED THEN INSERT (employee_id, reporting_manager, is_people_manager, is_budget_owner)
VALUES (@employee_id, @reporting_manager, 0, 0);
`);

        if (previousReportingManager !== supervisorLabel) {
          await new sql.Request(tx)
            .input('employee_id', sql.BigInt, employee.employee_id)
            .input('audit_action', sql.NVarChar(150), 'Supervisor assignment updated')
            .input('performed_by', sql.NVarChar(128), performedBy)
            .input('reason', sql.NVarChar(1000), reason)
            .input('old_value', sql.NVarChar(sql.MAX), JSON.stringify({ reportingManager: previousReportingManager }))
            .input('new_value', sql.NVarChar(sql.MAX), JSON.stringify({
              reportingManager: supervisorLabel,
              assignmentBatch,
              assignmentGroup,
              sourceLabel,
            }))
            .query(`
INSERT [hris].[EmployeeAuditLog](employee_id, audit_action, performed_by, reason, old_value, new_value)
VALUES (@employee_id, @audit_action, @performed_by, @reason, @old_value, @new_value);
`);
        }
      }
    }

    await tx.commit();
    committed = true;
    return {
      assignmentBatch,
      assignmentGroup,
      supervisor: {
        employeeCode: clean(supervisor.employee_code),
        employeeName: supervisorName,
        reportingManagerLabel: supervisorLabel,
      },
      assignments: await readSupervisorAssignments({ assignmentBatch }),
    };
  } catch (error) {
    if (!committed) await tx.rollback().catch(() => undefined);
    throw error;
  }
}
