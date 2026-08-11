/**
 * Create the 9 Sage Dayrate roster employees missing from HRIS, then activate as Daily Rate.
 *
 * Usage:
 *   npx tsx --tsconfig apps/dashboard/tsconfig.json apps/dashboard/scripts/import-missing-sage-dayrate-employees.mts
 *   npx tsx --tsconfig apps/dashboard/tsconfig.json apps/dashboard/scripts/import-missing-sage-dayrate-employees.mts --apply
 */
import { spawnSync } from 'node:child_process';
import sql from 'mssql';
import { getDleEnterpriseDbPool, loadWorkspaceEnv, updateEmployeeContractPayrollClassificationInDb } from '../lib/dle-enterprise-db.ts';
import { invalidatePayrollEmployeeCache, readDirectoryEmployees } from '../lib/payroll-employee-source.ts';

loadWorkspaceEnv();

const APPLY = process.argv.includes('--apply');
const XLSX =
  process.env.SAGE_DAYRATE_SCHEDULE_XLSX ||
  'C:\\Users\\chrisogbaisi\\OneDrive - Dorman Long Engineering Limited\\Desktop\\DLE Connect\\Hris\\Dayrate Payment Schedule\\DAYRATE PAYMENT SCHEDULE .xlsx';

const MISSING = ['C2820', 'C2824', 'C2823', 'C2819', 'C2818', 'C2817', 'C2815', 'C2816', 'C2822'] as const;

type SageIdentity = {
  code: string;
  company: 'DLE' | 'DLPC';
  firstName: string;
  lastName: string;
  jobTitle: string;
  location: string;
  dailyRate: number;
  gender: string;
};

const compact = (value: unknown) => String(value ?? '').trim();

const readSageIdentities = (): SageIdentity[] => {
  const missingJson = JSON.stringify([...MISSING]);
  const py = `
from openpyxl import load_workbook
import json, re
path = r'''${XLSX.replace(/\\/g, '\\\\')}'''
missing = set(json.loads('''${missingJson}'''))
wb = load_workbook(path, data_only=True, read_only=True)
by_code = {}
for sheet, company in [('DLE','DLE'),('DLPC','DLPC')]:
    ws = wb[sheet]
    rows = list(ws.iter_rows(values_only=True))
    if not rows: continue
    headers = [str(c or '').strip() for c in rows[0]]
    idx = {h:i for i,h in enumerate(headers)}
    for row in rows[1:]:
        code = str(row[idx.get('Emp. Code', 0)] or '').strip().upper()
        if code not in missing: continue
        first = str(row[idx.get('First Name', 1)] or '').strip()
        last = str(row[idx.get('Last Name', 2)] or '').strip()
        if not first and not last: continue
        rate = row[idx.get('Daily Rate', 5)] if 'Daily Rate' in idx else 0
        try: rate = float(rate or 0)
        except: rate = 0
        by_code[code] = {
            'code': code,
            'company': company,
            'firstName': first,
            'lastName': last,
            'jobTitle': str(row[idx.get('Job Title', 3)] or '').strip(),
            'location': str(row[idx.get('Location', 4)] or '').strip() if 'Location' in idx else '',
            'dailyRate': rate,
            'gender': str(row[idx.get('Gender', 8)] or row[idx.get('Gender', 7)] or '').strip(),
        }
wb.close()
print(json.dumps(list(by_code.values())))
`;
  const result = spawnSync('python', ['-c', py], { encoding: 'utf8', maxBuffer: 5 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || 'Failed reading Sage Excel');
  return JSON.parse(result.stdout) as SageIdentity[];
};

const findExisting = async (pool: sql.ConnectionPool, code: string) => {
  const rs = await pool.request()
    .input('code', sql.NVarChar(50), code)
    .query(`
      SELECT TOP 1 employee_id, employee_code, full_name, employment_status, employment_type
      FROM [hris].[Employees]
      WHERE UPPER(LTRIM(RTRIM(employee_code))) = @code
    `);
  return rs.recordset[0] as
    | { employee_id: number; employee_code: string; full_name: string; employment_status: string; employment_type: string }
    | undefined;
};

const createMinimalDailyRateEmployee = async (pool: sql.ConnectionPool, row: SageIdentity) => {
  const fullName = `${row.firstName} ${row.lastName}`.trim() || row.code;
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    const employeeRs = await new sql.Request(tx)
      .input('employee_code', sql.NVarChar(50), row.code)
      .input('full_name', sql.NVarChar(250), fullName)
      .input('employment_status', sql.VarChar(40), 'Active')
      .input('employment_type', sql.VarChar(40), 'Daily Rate')
      .query(`
        INSERT [hris].[Employees](employee_code, full_name, employment_status, employment_type)
        OUTPUT INSERTED.employee_id
        VALUES (@employee_code, @full_name, @employment_status, @employment_type);
      `);
    const employeeId = Number(employeeRs.recordset[0].employee_id);

    await new sql.Request(tx)
      .input('employee_id', sql.BigInt, employeeId)
      .input('first_name', sql.NVarChar(100), row.firstName || fullName)
      .input('last_name', sql.NVarChar(100), row.lastName || fullName)
      .input('gender', sql.NVarChar(40), compact(row.gender) || null)
      .query(`
        INSERT [hris].[EmployeePersonalInfo](employee_id, first_name, last_name, gender)
        VALUES (@employee_id, @first_name, @last_name, @gender);
      `);

    await new sql.Request(tx)
      .input('employee_id', sql.BigInt, employeeId)
      .input('staff_category', sql.NVarChar(100), 'Contract')
      .input('employee_category', sql.NVarChar(100), 'Daily Rate')
      .input('work_location', sql.NVarChar(150), compact(row.location) || null)
      .query(`
        INSERT [hris].[EmployeeEmploymentInfo](employee_id, staff_category, employee_category, work_location)
        VALUES (@employee_id, @staff_category, @employee_category, @work_location);
      `);

    await new sql.Request(tx)
      .input('employee_id', sql.BigInt, employeeId)
      .input('job_title', sql.NVarChar(200), compact(row.jobTitle) || null)
      .input('office_location', sql.NVarChar(200), compact(row.location) || null)
      .input('business_unit', sql.NVarChar(120), row.company)
      .query(`
        INSERT [hris].[EmployeeJobInfo](employee_id, job_title, office_location, business_unit)
        VALUES (@employee_id, @job_title, @office_location, @business_unit);
      `);

    await new sql.Request(tx)
      .input('employee_id', sql.BigInt, employeeId)
      .input('source_employee_id', sql.NVarChar(80), row.code)
      .input('raw_payload_json', sql.NVarChar(sql.MAX), JSON.stringify({ source: 'Sage Dayrate Payment Schedule July 2026', ...row }))
      .query(`
        INSERT [hris].[EmployeeSourceRecords](employee_id, source_system, source_employee_id, raw_payload_json)
        VALUES (@employee_id, N'Sage Dayrate Schedule', @source_employee_id, @raw_payload_json);
      `);

    await new sql.Request(tx)
      .input('employee_id', sql.BigInt, employeeId)
      .input('reason', sql.NVarChar(500), 'Imported from Sage Dayrate Payment Schedule July 2026 active roster')
      .query(`
        INSERT [hris].[EmployeeAuditLog](employee_id, audit_action, performed_by, reason)
        VALUES (@employee_id, N'Import Sage dayrate employee', SUSER_SNAME(), @reason);
      `);

    await tx.commit();
    return employeeId;
  } catch (error) {
    await tx.rollback();
    throw error;
  }
};

const main = async () => {
  console.log(APPLY ? 'MODE: APPLY' : 'MODE: DRY-RUN (pass --apply to persist)');
  const identities = readSageIdentities();
  console.log(`Sage identities for missing codes: ${identities.length}`);
  for (const row of identities) {
    console.log(`  ${row.code} [${row.company}] ${row.firstName} ${row.lastName} | ${row.jobTitle} | rate=${row.dailyRate}`);
  }

  const pool = await getDleEnterpriseDbPool();
  if (!pool) throw new Error('DLE_Enterprise DB pool unavailable');

  const plan: Array<{ row: SageIdentity; existingId?: number; action: 'create+activate' | 'activate-existing' }> = [];
  for (const row of identities) {
    const existing = await findExisting(pool, row.code);
    plan.push({
      row,
      existingId: existing?.employee_id,
      action: existing ? 'activate-existing' : 'create+activate',
    });
    if (existing) {
      console.log(`  found existing ${row.code} id=${existing.employee_id} status=${existing.employment_status} type=${existing.employment_type}`);
    }
  }

  const stillMissing = MISSING.filter((code) => !identities.some((row) => row.code === code));
  if (stillMissing.length) console.log('No Sage identity rows for:', stillMissing.join(', '));

  if (!APPLY) {
    console.log(`\nWould process ${plan.length} employee(s). Re-run with --apply to persist.`);
    return;
  }

  const results: Array<{ code: string; ok: boolean; detail: string }> = [];
  for (const item of plan) {
    try {
      let employeeId = item.existingId;
      if (!employeeId) {
        employeeId = await createMinimalDailyRateEmployee(pool, item.row);
      }
      await updateEmployeeContractPayrollClassificationInDb({
        employeeDbId: employeeId,
        action: 'activate-daily-rate',
        reason: `Imported/activated from Sage Dayrate Payment Schedule July 2026 (${item.row.company})`,
        payrollGroup: item.row.company === 'DLPC' ? 'DLPC' : 'DLE',
        ratePerDay: item.row.dailyRate > 0 ? item.row.dailyRate : null,
      });
      results.push({ code: item.row.code, ok: true, detail: `${item.action} -> id ${employeeId}` });
    } catch (error) {
      results.push({
        code: item.row.code,
        ok: false,
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }

  invalidatePayrollEmployeeCache();
  const source = await readDirectoryEmployees();
  const present = MISSING.filter((code) =>
    source.employees.some((employee) => compact(employee.employeeCode || employee.employeeId).toUpperCase() === code),
  );

  console.log('\n--- APPLY RESULT ---');
  for (const row of results) console.log(`${row.ok ? 'OK' : 'FAIL'} ${row.code}: ${row.detail}`);
  console.log(`Succeeded: ${results.filter((r) => r.ok).length}/${results.length}`);
  console.log(`Now visible in directory among missing set: ${present.length}/${MISSING.length} -> ${present.join(', ') || 'none'}`);
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
