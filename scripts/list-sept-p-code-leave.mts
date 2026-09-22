/**
 * Read-only: P-code employees who applied for leave in/from September 2026.
 */
import { getDleEnterpriseDbPool, loadWorkspaceEnv } from '../apps/dashboard/lib/dle-enterprise-db';
import { readPayrollEmployees } from '../apps/dashboard/lib/payroll-employee-source';

loadWorkspaceEnv();

const compact = (v: unknown) => String(v || '').trim();
const dateOnly = (v: unknown) => {
  if (!v) return '';
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? compact(v).slice(0, 10) : d.toISOString().slice(0, 10);
};
const pCode = (value: unknown) => {
  const text = compact(value).toUpperCase();
  const match = text.match(/\bP\d{3,5}\b/);
  return match ? match[0] : '';
};

const inSept = (iso: string) => iso >= '2026-09-01' && iso <= '2026-09-30';
const overlapsSept = (start: string, end: string) => start && end && start <= '2026-09-30' && end >= '2026-09-01';

const main = async () => {
  const pool = await getDleEnterpriseDbPool();
  if (!pool) {
    console.log('NO_DB');
    return;
  }
  const { employees } = await readPayrollEmployees();
  const byCode = new Map<string, (typeof employees)[number]>();
  for (const employee of employees) {
    const code = pCode(employee.employeeCode || employee.employeeId);
    if (code) byCode.set(code, employee);
  }

  const result = await pool.request().query(`
SELECT
  [Id],
  [EmployeeId],
  [FullName],
  [Department],
  [LeaveType],
  [StartDate],
  [EndDate],
  [Days],
  [StatusName],
  [WorkflowStage],
  [CreatedAt],
  [SourceSystem]
FROM [hris].[LeaveApplications]
WHERE [Id] NOT LIKE N'sage-leave-tx-%'
  AND (
    ([StartDate] >= '2026-09-01' AND [StartDate] < '2026-10-01')
    OR ([StartDate] <= '2026-09-30' AND [EndDate] >= '2026-09-01')
    OR ([CreatedAt] >= '2026-09-01' AND [CreatedAt] < '2026-10-01')
  )
ORDER BY [StartDate], [EmployeeId];`);

  const rows = (result.recordset as Array<Record<string, unknown>>)
    .map((row) => {
      const code = pCode(row.EmployeeId) || pCode(row.FullName);
      const employee = code ? byCode.get(code) : undefined;
      const resolved = code || pCode(employee?.employeeCode);
      return {
        code: resolved,
        name: compact(employee?.fullName || row.FullName),
        department: compact(employee?.department || row.Department),
        leaveType: compact(row.LeaveType),
        start: dateOnly(row.StartDate),
        end: dateOnly(row.EndDate),
        days: Number(row.Days || 0),
        status: compact(row.StatusName),
        stage: compact(row.WorkflowStage),
        applied: dateOnly(row.CreatedAt),
        source: compact(row.SourceSystem),
        id: compact(row.Id),
      };
    })
    .filter((row) => /^P\d+$/i.test(row.code) && (inSept(row.start) || overlapsSept(row.start, row.end) || inSept(row.applied)));

  const uniquePeople = [...new Map(rows.map((row) => [row.code, row])).values()].sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));

  console.log(`P-code leave from September 2026: ${uniquePeople.length} employees, ${rows.length} applications`);
  console.log('');
  console.log('code\tname\tdepartment\tleave_type\tstart\tend\tdays\tstatus\tapplied');
  for (const row of rows.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }) || a.start.localeCompare(b.start))) {
    console.log(`${row.code}\t${row.name}\t${row.department}\t${row.leaveType}\t${row.start}\t${row.end}\t${row.days}\t${row.status}\t${row.applied}`);
  }
  console.log('');
  console.log('Unique employees');
  for (const person of uniquePeople) {
    const apps = rows.filter((row) => row.code === person.code);
    const summary = apps.map((row) => `${row.leaveType} ${row.start}–${row.end} (${row.days}d, ${row.status})`).join('; ');
    console.log(`${person.code}\t${person.name}\t${person.department}\t${summary}`);
  }
};

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : error);
    process.exitCode = 1;
  })
  .finally(() => {
    setTimeout(() => process.exit(process.exitCode || 0), 250).unref();
  });
