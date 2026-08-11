/**
 * Sync HRIS Active/Inactive for C-code daily-rate staff from Sage Dayrate Payment Schedule.
 *
 * Sage Excel (July 2026): DLE + DLPC unique Emp Codes = active roster.
 * Everyone else with a C-code who is currently Active (or Daily Rate) is deactivated.
 *
 * Usage:
 *   npx tsx --tsconfig apps/dashboard/tsconfig.json apps/dashboard/scripts/sync-sage-dayrate-active-roster.mts
 *   npx tsx --tsconfig apps/dashboard/tsconfig.json apps/dashboard/scripts/sync-sage-dayrate-active-roster.mts --apply
 */
import { spawnSync } from 'node:child_process';
import { loadWorkspaceEnv } from '../lib/dle-enterprise-db.ts';
import { applyContractPayrollClassification } from '../lib/contract-payroll-classification-service.ts';
import { contractEmployeeCode, isDailyRatePayrollEmployee } from '../lib/payroll-employee-classification.ts';
import { invalidatePayrollEmployeeCache, readDirectoryEmployees } from '../lib/payroll-employee-source.ts';

loadWorkspaceEnv();

const APPLY = process.argv.includes('--apply');
const DEFAULT_XLSX =
  'C:\\Users\\chrisogbaisi\\OneDrive - Dorman Long Engineering Limited\\Desktop\\DLE Connect\\Hris\\Dayrate Payment Schedule\\DAYRATE PAYMENT SCHEDULE .xlsx';
const XLSX_PATH = process.env.SAGE_DAYRATE_SCHEDULE_XLSX || DEFAULT_XLSX;

type SageRow = { code: string; company: 'DLE' | 'DLPC'; ratePerDay: number; name: string };

const compact = (value: unknown) => String(value ?? '').trim();
const upper = (value: unknown) => compact(value).toUpperCase();
const isActiveStatus = (status: unknown) => !/terminated|resigned|retired|inactive|deceased/i.test(compact(status));

function readSageRosterFromPython(): SageRow[] {
  const py = `
from openpyxl import load_workbook
import json, re
path = r'''${XLSX_PATH.replace(/\\/g, '\\\\')}'''
wb = load_workbook(path, data_only=True, read_only=True)
out = []
for sheet, company in [('DLE','DLE'),('DLPC','DLPC')]:
    ws = wb[sheet]
    rows = list(ws.iter_rows(values_only=True))
    if not rows: continue
    headers = [str(c or '').strip() for c in rows[0]]
    def col(name):
        for i,h in enumerate(headers):
            if h.lower() == name.lower(): return i
        for i,h in enumerate(headers):
            if name.lower() in h.lower(): return i
        return None
    i_code = col('Emp. Code')
    i_first = col('First Name')
    i_last = col('Last Name')
    i_rate = col('Daily Rate')
    seen = set()
    for row in rows[1:]:
        if not row: continue
        code = str(row[i_code] if i_code is not None and i_code < len(row) else '').strip().upper()
        if not re.fullmatch(r'C\\d+', code): continue
        if code in seen: continue
        seen.add(code)
        rate = row[i_rate] if i_rate is not None and i_rate < len(row) else 0
        try: rate = float(rate or 0)
        except: rate = 0
        first = str(row[i_first] if i_first is not None and i_first < len(row) else '' or '').strip()
        last = str(row[i_last] if i_last is not None and i_last < len(row) else '' or '').strip()
        out.append({'code': code, 'company': company, 'ratePerDay': rate, 'name': (first + ' ' + last).strip()})
wb.close()
print(json.dumps(out))
`;
  const result = spawnSync('python', ['-c', py], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || 'Failed to read Sage Excel');
  }
  return JSON.parse(result.stdout) as SageRow[];
}

const main = async () => {
  console.log(APPLY ? 'MODE: APPLY' : 'MODE: DRY-RUN (pass --apply to persist)');
  console.log('Excel:', XLSX_PATH);

  const sageRows = readSageRosterFromPython();
  const sageByCode = new Map(sageRows.map((row) => [row.code, row]));
  console.log(`Sage unique roster: ${sageByCode.size} (DLE ${sageRows.filter((r) => r.company === 'DLE').length}, DLPC ${sageRows.filter((r) => r.company === 'DLPC').length})`);

  const source = await readDirectoryEmployees();
  const cEmployees = source.employees.filter((employee) => contractEmployeeCode(employee));
  console.log(`HRIS C-code employees loaded: ${cEmployees.length}`);

  const byCode = new Map<string, (typeof cEmployees)[number]>();
  for (const employee of cEmployees) {
    const code = upper(employee.employeeCode || employee.employeeId);
    if (/^C\d+$/.test(code)) byCode.set(code, employee);
  }

  const toActivate: Array<{ code: string; company: 'DLE' | 'DLPC'; ratePerDay: number; name: string; currentStatus: string; currentlyDaily: boolean }> = [];
  const alreadyActiveOk: string[] = [];
  const missingInHris: SageRow[] = [];
  const toDeactivate: Array<{ code: string; name: string; status: string; daily: boolean }> = [];
  const alreadyInactiveOk: string[] = [];

  for (const sage of sageByCode.values()) {
    const employee = byCode.get(sage.code);
    if (!employee) {
      missingInHris.push(sage);
      continue;
    }
    const active = isActiveStatus(employee.status);
    const daily = isDailyRatePayrollEmployee(employee);
    if (active && daily) {
      alreadyActiveOk.push(sage.code);
      continue;
    }
    toActivate.push({
      code: sage.code,
      company: sage.company,
      ratePerDay: sage.ratePerDay,
      name: sage.name || employee.fullName || sage.code,
      currentStatus: compact(employee.status) || 'Unknown',
      currentlyDaily: daily,
    });
  }

  for (const employee of cEmployees) {
    const code = upper(employee.employeeCode || employee.employeeId);
    if (!/^C\d+$/.test(code)) continue;
    if (sageByCode.has(code)) continue;
    const active = isActiveStatus(employee.status);
    const daily = isDailyRatePayrollEmployee(employee);
    // Already inactive and off the Sage roster — leave alone even if legacy labels linger.
    if (!active) {
      alreadyInactiveOk.push(code);
      continue;
    }
    // Active but not on Sage roster → deactivate
    if (active) {
      toDeactivate.push({
        code,
        name: employee.fullName || code,
        status: compact(employee.status) || 'Unknown',
        daily,
      });
    }
  }

  console.log('\n--- DIFF ---');
  console.log(`Already active daily-rate on Sage list: ${alreadyActiveOk.length}`);
  console.log(`Need ACTIVATE (on Sage, not fully active daily-rate in HRIS): ${toActivate.length}`);
  console.log(`Need DEACTIVATE (in HRIS active/daily, NOT on Sage list): ${toDeactivate.length}`);
  console.log(`Already inactive / not daily (not on Sage): ${alreadyInactiveOk.length}`);
  console.log(`On Sage but MISSING in HRIS directory: ${missingInHris.length}`);

  if (toActivate.length) {
    console.log('\nActivate sample (up to 15):');
    for (const row of toActivate.slice(0, 15)) {
      console.log(`  + ${row.code} [${row.company}] ${row.name} | was ${row.currentStatus} daily=${row.currentlyDaily} rate=${row.ratePerDay}`);
    }
  }
  if (toDeactivate.length) {
    console.log('\nDeactivate sample (up to 15):');
    for (const row of toDeactivate.slice(0, 15)) {
      console.log(`  - ${row.code} ${row.name} | was ${row.status} daily=${row.daily}`);
    }
  }
  if (missingInHris.length) {
    console.log('\nMissing in HRIS sample (up to 20):');
    for (const row of missingInHris.slice(0, 20)) {
      console.log(`  ? ${row.code} [${row.company}] ${row.name}`);
    }
  }

  if (!APPLY) {
    console.log('\nDry-run complete. Re-run with --apply to persist.');
    return;
  }

  const reasonActivate = 'Synced from Sage Dayrate Payment Schedule July 2026 active roster';
  const reasonDeactivate = 'Not on Sage Dayrate Payment Schedule July 2026 active roster — deactivated';

  let activated = 0;
  let deactivated = 0;
  const errors: string[] = [];

  for (const row of toActivate) {
    try {
      await applyContractPayrollClassification({
        employeeId: row.code,
        action: 'activate-daily-rate',
        reason: `${reasonActivate} (${row.company})`,
        payrollGroup: row.company === 'DLPC' ? 'DLPC' : 'DLE',
        ratePerDay: row.ratePerDay > 0 ? row.ratePerDay : null,
      });
      activated += 1;
    } catch (error) {
      errors.push(`ACTIVATE ${row.code}: ${error instanceof Error ? error.message : error}`);
    }
  }

  for (const row of toDeactivate) {
    try {
      await applyContractPayrollClassification({
        employeeId: row.code,
        action: 'deactivate-non-daily',
        reason: reasonDeactivate,
      });
      deactivated += 1;
    } catch (error) {
      errors.push(`DEACTIVATE ${row.code}: ${error instanceof Error ? error.message : error}`);
    }
  }

  invalidatePayrollEmployeeCache();

  console.log('\n--- APPLY RESULT ---');
  console.log(`Activated: ${activated}/${toActivate.length}`);
  console.log(`Deactivated: ${deactivated}/${toDeactivate.length}`);
  console.log(`Errors: ${errors.length}`);
  for (const error of errors.slice(0, 30)) console.log(`  ! ${error}`);
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
