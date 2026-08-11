/**
 * Import Sage Dayrate Payment Schedule bank + rate identity for the full active roster (193).
 * Sources: DLE / DLPC (rates, job, location) + DLE BANK SCHD / DLPC BANK SCHD (bank details).
 *
 * Usage:
 *   npx tsx --tsconfig apps/dashboard/tsconfig.json apps/dashboard/scripts/import-sage-dayrate-payroll-bank.mts
 *   npx tsx --tsconfig apps/dashboard/tsconfig.json apps/dashboard/scripts/import-sage-dayrate-payroll-bank.mts --apply
 *
 * Never logs account numbers or sort codes.
 */
import { spawnSync } from 'node:child_process';
import sql from 'mssql';
import { getDleEnterpriseDbPool, loadWorkspaceEnv } from '../lib/dle-enterprise-db.ts';
import { invalidatePayrollEmployeeCache } from '../lib/payroll-employee-source.ts';

loadWorkspaceEnv();

const APPLY = process.argv.includes('--apply');
const XLSX =
  process.env.SAGE_DAYRATE_SCHEDULE_XLSX ||
  'C:\\Users\\chrisogbaisi\\OneDrive - Dorman Long Engineering Limited\\Desktop\\DLE Connect\\Hris\\Dayrate Payment Schedule\\DAYRATE PAYMENT SCHEDULE .xlsx';

type SageBankRow = {
  code: string;
  company: 'DLE' | 'DLPC';
  employeeName: string;
  bankName: string;
  accountNo: string;
  sortCode: string;
  location: string;
  dailyRate: number;
  jobTitle: string;
  gender: string;
};

const compact = (value: unknown) => String(value ?? '').trim();
const upper = (value: unknown) => compact(value).toUpperCase();

const readSagePayload = (): SageBankRow[] => {
  const py = `
from openpyxl import load_workbook
import json, re
path = r'''${XLSX.replace(/\\/g, '\\\\')}'''
wb = load_workbook(path, data_only=True, read_only=True)

def find_header_row(rows, required):
    for i, row in enumerate(rows[:8]):
        headers = [str(c or '').strip() for c in row]
        lower = [h.lower() for h in headers]
        if all(any(req in h for h in lower) for req in required):
            return i, headers
    return None, None

identity = {}
for sheet, company in [('DLE','DLE'),('DLPC','DLPC')]:
    ws = wb[sheet]
    rows = list(ws.iter_rows(values_only=True))
    if not rows: continue
    headers = [str(c or '').strip() for c in rows[0]]
    idx = {h:i for i,h in enumerate(headers)}
    seen = set()
    for row in rows[1:]:
        code = str(row[idx.get('Emp. Code', 0)] or '').strip().upper()
        if not re.fullmatch(r'C\\d+', code) or code in seen: continue
        first = str(row[idx.get('First Name', 1)] or '').strip()
        last = str(row[idx.get('Last Name', 2)] or '').strip()
        if not first and not last: continue
        seen.add(code)
        rate = row[idx.get('Daily Rate')] if 'Daily Rate' in idx else 0
        try: rate = float(rate or 0)
        except: rate = 0
        identity[code] = {
            'company': company,
            'dailyRate': rate,
            'jobTitle': str(row[idx.get('Job Title', 3)] or '').strip(),
            'location': str(row[idx.get('Location', 4)] or '').strip() if 'Location' in idx else '',
            'gender': str(row[idx['Gender']] if 'Gender' in idx else '' or '').strip(),
            'name': (first + ' ' + last).strip(),
        }

bank = {}
for sheet, company in [('DLE BANK SCHD','DLE'),('DLPC BANK SCHD','DLPC')]:
    ws = wb[sheet]
    rows = list(ws.iter_rows(values_only=True))
    if not rows: continue
    hdr_i, headers = find_header_row(rows, ['employee code', 'bank', 'account'])
    if hdr_i is None: continue
    lower = [h.lower() for h in headers]
    def col(*names):
        for n in names:
            for i,h in enumerate(lower):
                if n in h: return i
        return None
    i_code = col('employee code', 'emp. code', 'emp code')
    i_name = col('employee name', 'name')
    i_bank = col('bank')
    i_acct = col('account no', 'account number', 'account')
    i_sort = col('sort code', 'sort')
    i_loc = col('location')
    for row in rows[hdr_i+1:]:
        if not row: continue
        code = str(row[i_code] if i_code is not None and i_code < len(row) else '').strip().upper()
        if not re.fullmatch(r'C\\d+', code): continue
        acct = row[i_acct] if i_acct is not None and i_acct < len(row) else ''
        if acct is None: acct = ''
        # Excel may store account as float
        if isinstance(acct, float):
            acct = str(int(acct)) if acct.is_integer() else str(acct)
        else:
            acct = str(acct).strip()
        sort = row[i_sort] if i_sort is not None and i_sort < len(row) else ''
        if isinstance(sort, float):
            sort = str(int(sort)) if float(sort).is_integer() else str(sort)
        else:
            sort = str(sort or '').strip()
        bank[code] = {
            'company': company,
            'employeeName': str(row[i_name] if i_name is not None and i_name < len(row) else '' or '').strip(),
            'bankName': str(row[i_bank] if i_bank is not None and i_bank < len(row) else '' or '').strip(),
            'accountNo': acct,
            'sortCode': sort,
            'location': str(row[i_loc] if i_loc is not None and i_loc < len(row) else '' or '').strip(),
        }

wb.close()
out = []
codes = sorted(set(identity) | set(bank))
for code in codes:
    idn = identity.get(code, {})
    bn = bank.get(code, {})
    out.append({
        'code': code,
        'company': bn.get('company') or idn.get('company') or 'DLE',
        'employeeName': bn.get('employeeName') or idn.get('name') or '',
        'bankName': bn.get('bankName') or '',
        'accountNo': bn.get('accountNo') or '',
        'sortCode': bn.get('sortCode') or '',
        'location': bn.get('location') or idn.get('location') or '',
        'dailyRate': float(idn.get('dailyRate') or 0),
        'jobTitle': idn.get('jobTitle') or '',
        'gender': idn.get('gender') or '',
    })
print(json.dumps(out))
`;
  const result = spawnSync('python', ['-c', py], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || 'Failed reading Sage Excel');
  return JSON.parse(result.stdout) as SageBankRow[];
};

const findEmployee = async (pool: sql.ConnectionPool, code: string) => {
  const rs = await pool.request()
    .input('code', sql.NVarChar(50), code)
    .query(`
      SELECT TOP 1 e.employee_id, e.employee_code, e.full_name, e.employment_status, e.employment_type,
             p.bank_name, p.account_number, p.rate_per_day, p.payroll_group
      FROM [hris].[Employees] e
      LEFT JOIN [hris].[EmployeePayrollSetup] p ON p.employee_id = e.employee_id
      WHERE UPPER(LTRIM(RTRIM(e.employee_code))) = @code
    `);
  return rs.recordset[0] as
    | {
        employee_id: number;
        employee_code: string;
        full_name: string;
        employment_status: string;
        employment_type: string;
        bank_name: string | null;
        account_number: string | null;
        rate_per_day: number | null;
        payroll_group: string | null;
      }
    | undefined;
};

const upsertPayrollAndProfile = async (pool: sql.ConnectionPool, employeeId: number, row: SageBankRow) => {
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    const accountNo = compact(row.accountNo).replace(/\D/g, '') || null;
    const sortCode = compact(row.sortCode);
    const branchName = sortCode && sortCode !== '1' ? sortCode : null;

    await new sql.Request(tx)
      .input('employee_id', sql.BigInt, employeeId)
      .input('payroll_group', sql.NVarChar(100), row.company)
      .input('pay_currency', sql.NVarChar(10), 'NGN')
      .input('payment_type', sql.NVarChar(80), 'Daily Rate')
      .input('payment_run', sql.NVarChar(80), 'Monthly')
      .input('rate_per_day', sql.Decimal(19, 4), row.dailyRate > 0 ? row.dailyRate : null)
      .input('hours_per_day', sql.Decimal(9, 4), 8)
      .input('bank_name', sql.NVarChar(150), compact(row.bankName) || null)
      .input('branch_name', sql.NVarChar(150), branchName)
      .input('account_number', sql.NVarChar(50), accountNo)
      .input('account_name', sql.NVarChar(250), compact(row.employeeName) || null)
      .query(`
        MERGE [hris].[EmployeePayrollSetup] AS target
        USING (SELECT @employee_id AS employee_id) AS source
        ON target.employee_id = source.employee_id
        WHEN MATCHED THEN UPDATE SET
          payroll_group = COALESCE(@payroll_group, target.payroll_group),
          pay_currency = COALESCE(@pay_currency, target.pay_currency),
          payment_type = COALESCE(@payment_type, target.payment_type),
          payment_run = COALESCE(@payment_run, target.payment_run),
          rate_per_day = CASE WHEN @rate_per_day IS NOT NULL AND @rate_per_day > 0 THEN @rate_per_day ELSE target.rate_per_day END,
          hours_per_day = COALESCE(@hours_per_day, target.hours_per_day),
          bank_name = CASE WHEN @bank_name IS NOT NULL AND @bank_name <> N'' THEN @bank_name ELSE target.bank_name END,
          branch_name = CASE WHEN @branch_name IS NOT NULL AND @branch_name <> N'' THEN @branch_name ELSE target.branch_name END,
          account_number = CASE WHEN @account_number IS NOT NULL AND @account_number <> N'' THEN @account_number ELSE target.account_number END,
          account_name = CASE WHEN @account_name IS NOT NULL AND @account_name <> N'' THEN @account_name ELSE target.account_name END,
          setup_assigned_to_payroll = 1,
          modified_at = SYSUTCDATETIME()
        WHEN NOT MATCHED THEN INSERT (
          employee_id, payroll_group, pay_currency, payment_type, payment_run,
          rate_per_day, hours_per_day, bank_name, branch_name, account_number, account_name,
          setup_assigned_to_payroll
        ) VALUES (
          @employee_id, @payroll_group, @pay_currency, @payment_type, @payment_run,
          @rate_per_day, @hours_per_day, @bank_name, @branch_name, @account_number, @account_name,
          1
        );
      `);

    if (compact(row.jobTitle) || compact(row.location)) {
      await new sql.Request(tx)
        .input('employee_id', sql.BigInt, employeeId)
        .input('job_title', sql.NVarChar(200), compact(row.jobTitle) || null)
        .input('office_location', sql.NVarChar(200), compact(row.location) || null)
        .input('business_unit', sql.NVarChar(120), row.company)
        .query(`
          MERGE [hris].[EmployeeJobInfo] AS target
          USING (SELECT @employee_id AS employee_id) AS source
          ON target.employee_id = source.employee_id
          WHEN MATCHED THEN UPDATE SET
            job_title = COALESCE(NULLIF(@job_title, N''), target.job_title),
            office_location = COALESCE(NULLIF(@office_location, N''), target.office_location),
            business_unit = COALESCE(NULLIF(@business_unit, N''), target.business_unit),
            modified_at = SYSUTCDATETIME()
          WHEN NOT MATCHED THEN INSERT (employee_id, job_title, office_location, business_unit)
          VALUES (@employee_id, @job_title, @office_location, @business_unit);
        `);
    }

    if (compact(row.location)) {
      await new sql.Request(tx)
        .input('employee_id', sql.BigInt, employeeId)
        .input('work_location', sql.NVarChar(150), compact(row.location))
        .query(`
          MERGE [hris].[EmployeeEmploymentInfo] AS target
          USING (SELECT @employee_id AS employee_id) AS source
          ON target.employee_id = source.employee_id
          WHEN MATCHED THEN UPDATE SET
            work_location = COALESCE(NULLIF(@work_location, N''), target.work_location),
            modified_at = SYSUTCDATETIME()
          WHEN NOT MATCHED THEN INSERT (employee_id, staff_category, employee_category, work_location)
          VALUES (@employee_id, N'Contract', N'Daily Rate', @work_location);
        `);
    }

    await new sql.Request(tx)
      .input('employee_id', sql.BigInt, employeeId)
      .input('reason', sql.NVarChar(500), `Imported Sage dayrate bank/rate identity (${row.company})`)
      .query(`
        INSERT [hris].[EmployeeAuditLog](employee_id, audit_action, performed_by, reason)
        VALUES (@employee_id, N'Import Sage dayrate payroll/bank', SUSER_SNAME(), @reason);
      `);

    await tx.commit();
  } catch (error) {
    await tx.rollback();
    throw error;
  }
};

const main = async () => {
  console.log(APPLY ? 'MODE: APPLY' : 'MODE: DRY-RUN (pass --apply to persist)');
  const rows = readSagePayload();
  const withBank = rows.filter((r) => compact(r.bankName) && compact(r.accountNo));
  const withRate = rows.filter((r) => r.dailyRate > 0);
  console.log(`Sage roster rows: ${rows.length}`);
  console.log(`With bank+account: ${withBank.length}`);
  console.log(`With daily rate: ${withRate.length}`);

  const pool = await getDleEnterpriseDbPool();
  if (!pool) throw new Error('DLE_Enterprise DB pool unavailable');

  let found = 0;
  let missing = 0;
  let alreadyBanked = 0;
  let needBank = 0;
  let needRate = 0;
  const missingCodes: string[] = [];
  const plan: Array<{ row: SageBankRow; employeeId: number }> = [];

  for (const row of rows) {
    const existing = await findEmployee(pool, row.code);
    if (!existing) {
      missing += 1;
      missingCodes.push(row.code);
      continue;
    }
    found += 1;
    const hasBank = Boolean(compact(existing.bank_name) && compact(existing.account_number));
    if (hasBank) alreadyBanked += 1;
    if (compact(row.bankName) && compact(row.accountNo) && !hasBank) needBank += 1;
    if (row.dailyRate > 0 && !(Number(existing.rate_per_day) > 0)) needRate += 1;
    plan.push({ row, employeeId: Number(existing.employee_id) });
  }

  console.log(`Matched in HRIS: ${found}`);
  console.log(`Missing in HRIS: ${missing}${missing ? ` -> ${missingCodes.join(', ')}` : ''}`);
  console.log(`Already have bank in HRIS: ${alreadyBanked}`);
  console.log(`Will fill bank from Sage (currently empty): ${needBank}`);
  console.log(`Will fill rate from Sage (currently empty): ${needRate}`);
  console.log(`Will upsert payroll identity for: ${plan.length}`);

  if (!APPLY) {
    console.log('\nDry-run complete. Re-run with --apply to persist bank/rate/job/location.');
    return;
  }

  const results: Array<{ code: string; ok: boolean; detail: string }> = [];
  for (const item of plan) {
    try {
      await upsertPayrollAndProfile(pool, item.employeeId, item.row);
      const bits = [
        compact(item.row.bankName) ? 'bank' : null,
        item.row.dailyRate > 0 ? `rate=${item.row.dailyRate}` : null,
        compact(item.row.jobTitle) ? 'job' : null,
      ].filter(Boolean);
      results.push({ code: item.row.code, ok: true, detail: bits.join(', ') || 'updated' });
    } catch (error) {
      results.push({
        code: item.row.code,
        ok: false,
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }

  invalidatePayrollEmployeeCache();

  const ok = results.filter((r) => r.ok).length;
  const fail = results.filter((r) => !r.ok);
  console.log('\n--- APPLY RESULT ---');
  console.log(`Succeeded: ${ok}/${results.length}`);
  if (fail.length) {
    console.log('Failures:');
    for (const row of fail.slice(0, 30)) console.log(`  FAIL ${row.code}: ${row.detail}`);
  }
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
