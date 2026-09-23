import sql from 'mssql';
import { getDleEnterpriseDbPool, loadWorkspaceEnv } from '../apps/dashboard/lib/dle-enterprise-db.ts';
import { listOvertimeAuthorizationRequests } from '../apps/dashboard/lib/overtime-approval-workflow-store.ts';
import { postApprovedOvertimeToTimesheets } from '../apps/dashboard/lib/overtime-timesheet-posting.ts';
import { postPermanentTimesheetEarningsFromTimesheets } from '../apps/dashboard/lib/payroll-timesheet-ot-posting.ts';

loadWorkspaceEnv();

const CLOSED = new Set(['Rejected', 'Cancelled', 'HR Approved']);
const actor = 'Super Administrator';
const comment = 'Approved all open overtime authorizations.';

const pool = await getDleEnterpriseDbPool();
if (!pool) throw new Error('DLE Enterprise database is unavailable');

const open = (await listOvertimeAuthorizationRequests()).filter((row) => !CLOSED.has(row.status));
console.log(`Approving ${open.length} open overtime authorization(s)`);

let approved = 0;
let postedLines = 0;
let skippedLines = 0;
const failures: string[] = [];
const periods = new Set<string>();

for (const request of open) {
  try {
    await pool.request()
      .input('Id', sql.NVarChar(120), request.id)
      .input('OwnerName', sql.NVarChar(220), request.supervisorName || 'Supervisor')
      .query(`
UPDATE [hris].[OvertimeAuthorizationRequests]
SET [WorkflowStatus] = N'HR Approved',
    [CurrentOwnerRole] = N'Supervisor',
    [CurrentOwnerName] = @OwnerName,
    [UpdatedAt] = SYSUTCDATETIME()
WHERE [Id] = @Id
  AND [WorkflowStatus] NOT IN (N'HR Approved', N'Rejected', N'Cancelled')
`);
    await pool.request()
      .input('Id', sql.NVarChar(120), `ota-aud-${Date.now()}-${Math.random().toString(16).slice(2)}`)
      .input('RequestId', sql.NVarChar(120), request.id)
      .input('Actor', sql.NVarChar(220), actor)
      .input('OldStatus', sql.NVarChar(60), request.status)
      .input('Comment', sql.NVarChar(700), comment)
      .query(`
INSERT INTO [hris].[OvertimeAuthorizationAudit] ([Id],[RequestId],[Actor],[ActionName],[OldStatus],[NewStatus],[Comment])
VALUES (@Id,@RequestId,@Actor,N'super-admin-approve-all',@OldStatus,N'HR Approved',@Comment)
`);
    const posting = await postApprovedOvertimeToTimesheets({
      requestId: request.id,
      workDate: request.workDate,
      supervisorCode: request.supervisorCode,
      supervisorName: request.supervisorName,
      workCenter: request.workCenter,
      projectCode: request.projectCode,
      projectName: request.projectName,
      employees: request.employees.map((employee) => ({
        employeeCode: employee.employeeCode,
        employeeName: employee.employeeName,
        overtimeHours: employee.overtimeHours,
      })),
    });
    approved += 1;
    postedLines += posting.posted;
    skippedLines += posting.skipped.length;
    const period = String(request.workDate || '').slice(0, 7);
    if (period) periods.add(period);
    if (approved % 10 === 0 || approved === open.length) {
      console.log(`progress ${approved}/${open.length} postedLines=${postedLines} skippedLines=${skippedLines}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    failures.push(`${request.id}: ${message}`);
    console.error('FAIL', request.id, message);
  }
}

for (const period of periods) {
  try {
    await postPermanentTimesheetEarningsFromTimesheets(period);
    console.log('payroll OT posting', period);
  } catch (error) {
    console.error('payroll OT posting failed', period, error instanceof Error ? error.message : error);
  }
}

const remaining = (await listOvertimeAuthorizationRequests()).filter((row) => !CLOSED.has(row.status)).length;
console.log(JSON.stringify({ approved, postedLines, skippedLines, failures: failures.length, remainingOpen: remaining, periods: [...periods] }, null, 2));
if (failures.length) console.log(failures.slice(0, 20).join('\n'));
process.exit(failures.length ? 1 : 0);
