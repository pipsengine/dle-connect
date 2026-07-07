import { getDleEnterpriseDbPool } from '../lib/dle-enterprise-db.ts';
import { readActiveSagePayrollEmployees, normalizePayrollMatchKey } from '../lib/sage-people-payroll-store.ts';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

const str = (value: unknown) => String(value ?? '').trim();

const main = async () => {
  const apply = process.argv.includes('--apply');
  // Codes that must always be (re)migrated even if a matching record already exists in HRIS.
  const forceArg = process.argv.find((arg) => arg.startsWith('--force='));
  const forceCodes = new Set(
    (forceArg ? forceArg.slice('--force='.length) : '')
      .split(',')
      .map((code) => normalizePayrollMatchKey(code))
      .filter(Boolean),
  );

  console.log('Reading active employees from Sage payroll...');
  const sageEmployees = await readActiveSagePayrollEmployees();
  console.log(`  Sage active employees: ${sageEmployees.length}`);

  const pool = await getDleEnterpriseDbPool();
  if (!pool) {
    console.error('Unable to connect to DLE_Enterprise HRIS database.');
    process.exit(1);
  }

  console.log('Reading existing HRIS employee identifiers...');
  const [sourceRes, codeRes] = await Promise.all([
    pool.request().query(`
      SELECT source_employee_id
      FROM [hris].[EmployeeSourceRecords]
      WHERE source_system = N'Sage 300 People Payroll'
    `),
    pool.request().query(`SELECT employee_code FROM [hris].[Employees]`),
  ]);

  const existingSourceIds = new Set<string>(
    (sourceRes.recordset || []).map((row: any) => str(row.source_employee_id)).filter(Boolean),
  );
  const existingCodeKeys = new Set<string>(
    (codeRes.recordset || []).map((row: any) => normalizePayrollMatchKey(str(row.employee_code))).filter(Boolean),
  );

  console.log(`  HRIS Sage source records: ${existingSourceIds.size}`);
  console.log(`  HRIS employee codes: ${existingCodeKeys.size}`);

  const employeeCodeKey = (employee: (typeof sageEmployees)[number]) =>
    normalizePayrollMatchKey(str(employee.directoryEmployeeCode || employee.employeeCode));

  const missing = sageEmployees.filter((employee) => {
    const sourceId = str(employee.employeeId);
    if (sourceId && existingSourceIds.has(sourceId)) return false;
    const codeKey = employeeCodeKey(employee);
    if (codeKey && existingCodeKeys.has(codeKey)) return false;
    return true;
  });

  // Force-included employees (e.g. re-activated today) that may already exist but must be refreshed.
  const forced = forceCodes.size
    ? sageEmployees.filter((employee) => {
        const codeKey = employeeCodeKey(employee);
        const idKey = normalizePayrollMatchKey(str(employee.employeeId));
        return (forceCodes.has(codeKey) || forceCodes.has(idKey)) && !missing.includes(employee);
      })
    : [];

  if (forceCodes.size) {
    console.log('');
    console.log(`Force-include requested for: ${Array.from(forceCodes).join(', ')}`);
    for (const key of forceCodes) {
      const found = sageEmployees.find(
        (employee) => employeeCodeKey(employee) === key || normalizePayrollMatchKey(str(employee.employeeId)) === key,
      );
      if (!found) {
        console.log(`  WARNING: ${key} not found in active Sage payroll employees; cannot migrate.`);
      } else {
        const alreadyMissing = missing.includes(found);
        console.log(
          `  ${str(found.directoryEmployeeCode || found.employeeCode)} (${str(found.displayName)}) — ${alreadyMissing ? 'already in missing list' : 'already in HRIS, will be refreshed'}`,
        );
      }
    }
  }

  const migrationSet = [...missing, ...forced];

  console.log('');
  console.log('='.repeat(110));
  console.log(`EMPLOYEES IN SAGE PAYROLL BUT NOT IN HRIS: ${missing.length}`);
  console.log('='.repeat(110));

  if (missing.length) {
    const pad = (value: string, len: number) => value.slice(0, len).padEnd(len);
    console.log(
      `${pad('#', 4)}${pad('SageID', 10)}${pad('Code', 16)}${pad('Name', 34)}${pad('Department', 24)}${pad('Job Title', 22)}`,
    );
    console.log('-'.repeat(110));
    missing.forEach((employee, index) => {
      console.log(
        `${pad(String(index + 1), 4)}${pad(str(employee.employeeId), 10)}${pad(str(employee.directoryEmployeeCode || employee.employeeCode), 16)}${pad(str(employee.displayName), 34)}${pad(str(employee.departmentName || employee.hierarchyDepartmentName), 24)}${pad(str(employee.jobTitle), 22)}`,
      );
    });
  } else {
    console.log('None. HRIS is already in sync with active Sage payroll employees.');
  }

  const cwd = process.cwd();
  const dashboardRoot = cwd.endsWith(path.join('apps', 'dashboard')) ? cwd : path.join(cwd, 'apps', 'dashboard');
  const outPath = path.join(dashboardRoot, 'data', 'hris', 'sage-hris-missing-review.json');
  await writeFile(
    outPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        sageActiveCount: sageEmployees.length,
        hrisSageSourceCount: existingSourceIds.size,
        missingCount: missing.length,
        missing: missing.map((employee) => ({
          sageEmployeeId: employee.employeeId,
          code: str(employee.directoryEmployeeCode || employee.employeeCode),
          name: str(employee.displayName),
          firstNames: str(employee.firstNames),
          lastName: str(employee.lastName),
          department: str(employee.departmentName || employee.hierarchyDepartmentName),
          jobTitle: str(employee.jobTitle),
          jobGrade: str(employee.jobGrade || employee.jobGradeCode),
          site: str(employee.siteName || employee.hierarchyLocationName),
          employeeType: str(employee.hierarchyEmployeeTypeName),
          company: str(employee.companyName),
          currency: str(employee.companyCurrency),
          dateEngaged: employee.dateEngaged,
          paymentRun: str(employee.paymentRunLong || employee.paymentRunShort),
          periodSalary: employee.periodSalary,
        })),
      },
      null,
      2,
    ),
    'utf8',
  );
  console.log('');
  console.log(`Full review list written to: ${outPath}`);

  if (apply && migrationSet.length) {
    console.log('');
    console.log(`--apply flag detected. Migrating ${migrationSet.length} employees into HRIS (${missing.length} new, ${forced.length} forced refresh)...`);
    const { importSagePayrollEmployeesToDb } = await import('../lib/dle-enterprise-db.ts');
    const result = await importSagePayrollEmployeesToDb(migrationSet as any);
    console.log('Migration result:', JSON.stringify(result, null, 2));
  } else if (!apply) {
    console.log('');
    console.log('DRY RUN ONLY. No changes were made. Re-run with --apply to migrate the listed employees.');
  }

  await pool.close();
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
