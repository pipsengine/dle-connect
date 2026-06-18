const fs = require('fs');
const path = require('path');
const sql = require('mssql');

const dryRun = process.argv.includes('--dry-run');
const fileArg = process.argv.find((arg) => arg.endsWith('.json'));

if (!fileArg) {
  console.error('Usage: node scripts/database/supervisor-assignment-importer.js <roster.json> [--dry-run]');
  process.exit(1);
}

function loadWorkspaceEnv() {
  const envPath = path.resolve('.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[match[1]]) process.env[match[1]] = value;
  }
}

function dbConfig() {
  return {
    server: process.env.DLE_ENTERPRISE_DB_HOST,
    port: Number(process.env.DLE_ENTERPRISE_DB_PORT || 1433),
    database: process.env.DLE_ENTERPRISE_DB_NAME || 'DLE_Enterprise',
    user: process.env.DLE_ENTERPRISE_DB_USER,
    password: process.env.DLE_ENTERPRISE_DB_PASSWORD,
    options: {
      encrypt: String(process.env.DLE_ENTERPRISE_DB_ENCRYPT).toLowerCase() !== 'false',
      trustServerCertificate: String(process.env.DLE_ENTERPRISE_DB_TRUST_SERVER_CERTIFICATE).toLowerCase() === 'true',
    },
  };
}

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function displayName(row) {
  return [row.first_name, row.middle_name, row.last_name].map(clean).filter(Boolean).join(' ') || clean(row.full_name) || clean(row.employee_code);
}

async function ensureAssignmentTable(request) {
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
}

async function findEmployee(tx, employeeCode) {
  if (!employeeCode) return null;
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
}

async function upsertAssignment(tx, values) {
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
}

async function main() {
  loadWorkspaceEnv();
  const rosterPath = path.resolve(fileArg);
  const config = JSON.parse(fs.readFileSync(rosterPath, 'utf8'));
  const pool = await sql.connect(dbConfig());
  const tx = new sql.Transaction(pool);
  await tx.begin();

  try {
    await ensureAssignmentTable(new sql.Request(tx));
    const supervisor = await findEmployee(tx, config.supervisorEmployeeCode);
    if (!supervisor) throw new Error(`Supervisor ${config.supervisorEmployeeCode} was not found.`);
    if (/inactive|terminated|resigned|retired|deceased/i.test(clean(supervisor.employment_status))) {
      throw new Error(`Supervisor ${config.supervisorEmployeeCode} is not active.`);
    }

    const supervisorLabel = `${clean(supervisor.employee_code)} - ${clean(supervisor.full_name)}`;
    const supervisorName = displayName(supervisor);
    const results = [];

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

    for (const row of config.rows || []) {
      const employee = await findEmployee(tx, row.employeeCode);
      const matchedStatus = employee ? 'Matched' : 'Unresolved';
      const previousReportingManager = clean(employee?.reporting_manager) || null;
      const employeeName = employee ? displayName(employee) : null;
      const newReportingManager = employee ? supervisorLabel : null;

      await upsertAssignment(tx, {
        assignmentBatch: config.assignmentBatch,
        assignmentGroup: config.assignmentGroup,
        sourceLabel: clean(row.sourceName) || clean(row.employeeCode),
        supervisorEmployeeId: supervisor.employee_id,
        supervisorEmployeeCode: supervisor.employee_code,
        supervisorName,
        employeeId: employee?.employee_id || null,
        employeeCode: employee?.employee_code || clean(row.employeeCode),
        employeeName,
        tradeRole: clean(row.tradeRole) || null,
        matchedStatus,
        matchConfidence: clean(row.matchConfidence) || (employee ? 'EmployeeCode' : 'Unresolved'),
        matchNote: clean(row.matchNote) || null,
        previousReportingManager,
        newReportingManager,
        assignedBy: clean(config.performedBy) || 'codex.database-import',
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
            .input('audit_action', sql.NVarChar(150), 'Supervisor assignment import')
            .input('performed_by', sql.NVarChar(128), clean(config.performedBy) || 'codex.database-import')
            .input('reason', sql.NVarChar(1000), clean(config.reason) || 'Supervisor assignment import.')
            .input('old_value', sql.NVarChar(sql.MAX), JSON.stringify({ reportingManager: previousReportingManager }))
            .input('new_value', sql.NVarChar(sql.MAX), JSON.stringify({
              reportingManager: supervisorLabel,
              assignmentBatch: config.assignmentBatch,
              assignmentGroup: config.assignmentGroup,
              sourceName: row.sourceName,
              tradeRole: row.tradeRole,
              matchConfidence: row.matchConfidence,
              matchNote: row.matchNote || null,
            }))
            .query(`
INSERT [hris].[EmployeeAuditLog](employee_id, audit_action, performed_by, reason, old_value, new_value)
VALUES (@employee_id, @audit_action, @performed_by, @reason, @old_value, @new_value);
`);
        }
      }

      results.push({
        sourceName: row.sourceName,
        employeeCode: employee?.employee_code || clean(row.employeeCode),
        employeeName: employeeName || '',
        status: matchedStatus,
        previousReportingManager,
        newReportingManager,
        note: row.matchNote || '',
      });
    }

    if (dryRun) await tx.rollback();
    else await tx.commit();

    console.table(results);
    console.log(`${dryRun ? 'Dry run complete' : 'Assignment committed'}: ${results.filter((x) => x.status === 'Matched').length} matched, ${results.filter((x) => x.status !== 'Matched').length} unresolved.`);
  } catch (error) {
    await tx.rollback().catch(() => undefined);
    throw error;
  } finally {
    await pool.close();
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
