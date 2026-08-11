/**
 * HISTORICAL / MIGRATION ONLY — July 2026 Sage dayrate cutover.
 *
 * Sage People license has expired. From August 2026 onward, C-code daily-rate
 * salaries are computed from HRIS timesheet bookings (not Sage schedule uploads).
 * Do not re-run this script for future periods.
 *
 * Restart July 2026 payroll from Validation with Sage day counts + OT/allowances.
 *
 * 1) Feed Sage Total Weekday days into TimesheetPayrollUpdates for per-2026-07
 * 2) Clear leftover daily-rate labels on Inactive off-roster C-codes
 * 3) Import Sage OT/allowance lines as period earning adjustments (July only)
 * 4) validate-payroll → create-run for both packs
 *
 * Usage:
 *   npx tsx --tsconfig apps/dashboard/tsconfig.json apps/dashboard/scripts/restart-july-2026-payroll.mts
 *   npx tsx --tsconfig apps/dashboard/tsconfig.json apps/dashboard/scripts/restart-july-2026-payroll.mts --apply
 */
import { spawnSync } from 'node:child_process';
import sql from 'mssql';
import { getDleEnterpriseDbPool, loadWorkspaceEnv } from '../lib/dle-enterprise-db.ts';
import { invalidatePayrollEmployeeCache } from '../lib/payroll-employee-source.ts';
import { executePayrollWorkflowAction } from '../lib/payroll-workflow-service.ts';
import { calculatePayrollForPeriod } from '../lib/payroll-calculation-service.ts';
import {
  invalidateTimesheetHoursCacheForPeriod,
  writeTimesheetPayrollUpdates,
  type TimesheetPayrollUpdate,
} from '../lib/timesheet-entry-store.ts';
import { getPayrollRunForPeriod, savePayrollRun, ensurePayrollRunsForPeriod } from '../lib/payroll-run-store.ts';
import {
  readPayrollPeriodEarningAdjustments,
  removePayrollPeriodEarningAdjustments,
  writePayrollPeriodEarningAdjustments,
  type PayrollPeriodEarningAdjustment,
} from '../lib/payroll-period-earning-adjustments-store.ts';

loadWorkspaceEnv();
// Ensure July cutover soft-gates stay deferred while roster/gross is stabilized.
if (!process.env.HRIS_PAYROLL_TOLERANCE_PERIODS?.includes('2026-07')) {
  process.env.HRIS_PAYROLL_TOLERANCE_PERIODS = '2026-05,2026-06,2026-07';
}

const APPLY = process.argv.includes('--apply');
const PERIOD = '2026-07';
const PERIOD_ID = `per-${PERIOD}`;
const SAGE_DAYRATE_SOURCE = 'Sage Dayrate Payment Schedule July 2026';
const XLSX =
  process.env.SAGE_DAYRATE_SCHEDULE_XLSX ||
  'C:\\Users\\chrisogbaisi\\OneDrive - Dorman Long Engineering Limited\\Desktop\\DLE Connect\\Hris\\Dayrate Payment Schedule\\DAYRATE PAYMENT SCHEDULE .xlsx';

type SageDayRow = {
  code: string;
  name: string;
  weekdays: number;
  company: string;
  earnings: Array<{ code: string; name: string; amount: number; taxable: boolean }>;
};

const num = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const readSageWeekdays = (): SageDayRow[] => {
  const py = `
from openpyxl import load_workbook
import json, re
path = r'''${XLSX.replace(/\\/g, '\\\\')}'''
wb = load_workbook(path, data_only=True, read_only=True)
out = []
seen = set()
maps = [
  ('Wkd Ovt Amt', 'WEEKDAYOVT', 'WEEKDAY OVERTIME', True),
  ('Sat Ovt Amt', 'SATEARN', 'SATURDAY EARNING', True),
  ('Sun Ovt Amt', 'SUNDAYEARN', 'SUNDAY EARNING', True),
  ('PH Amt', 'PUBHOL', 'PUBLIC HOLIDAY', True),
  ('Night Amt', 'NIGHT', 'NIGHT ALLOWANCE', True),
  ('Meal Allowance', 'MEAL', 'MEAL ALLOWANCE', False),
  ('Transport', 'TRANSPORT', 'TRANSPORT ALLOWANCE', True),
  ('Stock Count', 'STOCK', 'STOCK COUNT ALLOWANCE', True),
  ('Site Allowance', 'SITE', 'SITE ALLOWANCE', True),
  ('TCM Meal', 'TCMMEAL', 'TCM MEAL', False),
  ('TCM TRANSPORT', 'TCMTRANS', 'TCM TRANSPORT', True),
]
for sheet, company in [('DLE','DLE'),('DLPC','DLPC')]:
    ws = wb[sheet]
    rows = list(ws.iter_rows(values_only=True))
    if not rows: continue
    headers = [str(c or '').strip() for c in rows[0]]
    idx = {h:i for i,h in enumerate(headers)}
    for row in rows[1:]:
        code = str(row[idx.get('Emp. Code', 0)] or '').strip().upper()
        if not re.fullmatch(r'C\\d+', code) or code in seen: continue
        first = str(row[idx.get('First Name', 1)] or '').strip()
        last = str(row[idx.get('Last Name', 2)] or '').strip()
        if not first and not last: continue
        days = row[idx.get('Total Weekday')] if 'Total Weekday' in idx else 0
        try: days = float(days or 0)
        except: days = 0
        earnings = []
        for col, ecode, ename, taxable in maps:
            if col not in idx: continue
            try: amt = float(row[idx[col]] or 0)
            except: amt = 0
            # Always keep Meal Allowance (including 0) so auto ₦500×days meal can be suppressed.
            if abs(amt) < 0.005 and ecode != 'MEAL': continue
            earnings.append({'code': ecode, 'name': ename, 'amount': amt, 'taxable': taxable})
        seen.add(code)
        out.append({'code': code, 'name': (first + ' ' + last).strip(), 'weekdays': days, 'company': company, 'earnings': earnings})
wb.close()
print(json.dumps(out))
`;
  const result = spawnSync('python', ['-c', py], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || 'Failed reading Sage Excel');
  return JSON.parse(result.stdout) as SageDayRow[];
};

const clearInactiveDailyLabels = async () => {
  const pool = await getDleEnterpriseDbPool();
  if (!pool) throw new Error('DB unavailable');
  const sageCodes = readSageWeekdays().map((row) => row.code);
  const rs = await pool.request().query(`
    SELECT e.employee_id, e.employee_code
    FROM [hris].[Employees] e
    WHERE e.employee_code LIKE N'C%'
      AND (
        e.employment_status LIKE N'%Inactive%'
        OR e.employment_status LIKE N'%Terminated%'
        OR e.employment_status LIKE N'%Resigned%'
        OR e.employment_status LIKE N'%Retired%'
        OR e.employment_status LIKE N'%Deceased%'
      )
  `);
  const sageSet = new Set(sageCodes);
  const targets = (rs.recordset as Array<{ employee_id: number; employee_code: string }>).filter(
    (row) => !sageSet.has(String(row.employee_code || '').trim().toUpperCase()),
  );
  console.log(`Inactive off-roster C-codes to scrub labels: ${targets.length}`);
  if (!APPLY) return targets.length;

  let updated = 0;
  for (const row of targets) {
    await pool.request()
      .input('employee_id', sql.BigInt, row.employee_id)
      .query(`
        UPDATE [hris].[EmployeePayrollSetup]
        SET rate_per_day = NULL,
            rate_per_hour = NULL,
            payment_type = CASE WHEN payment_type IN (N'Timesheet Rate', N'Daily Rate', N'Day Rate') THEN N'Contract' ELSE payment_type END,
            salary_grade = CASE WHEN salary_grade LIKE N'%DAY RATE%' OR salary_grade LIKE N'%DAILY RATE%' THEN N'Contract' ELSE salary_grade END,
            modified_at = SYSUTCDATETIME()
        WHERE employee_id = @employee_id;

        UPDATE [hris].[EmployeeEmploymentInfo]
        SET staff_category = CASE WHEN staff_category LIKE N'%DAY RATE%' OR staff_category LIKE N'%DAILY RATE%' THEN N'Contract' ELSE staff_category END,
            employee_category = CASE WHEN employee_category LIKE N'%DAY RATE%' OR employee_category LIKE N'%DAILY RATE%' THEN N'Contract' ELSE employee_category END,
            modified_at = SYSUTCDATETIME()
        WHERE employee_id = @employee_id;
      `);
    updated += 1;
  }
  console.log(`Scrubbed labels: ${updated}`);
  return updated;
};

const seedSageTimesheetDays = async () => {
  const rows = readSageWeekdays();
  const withDays = rows.filter((row) => row.weekdays > 0);
  const earningLines = rows.reduce((sum, row) => sum + row.earnings.length, 0);
  console.log(`Sage weekday rows: ${rows.length}, with days>0: ${withDays.length}, supplemental lines: ${earningLines}`);
  if (!APPLY) return rows;

  const update: TimesheetPayrollUpdate = {
    id: `payroll-${PERIOD_ID}-sage-dayrate`,
    periodId: PERIOD_ID,
    periodName: 'July 2026 (Sage Dayrate Schedule)',
    acknowledgedAt: new Date().toISOString(),
    acknowledgedBy: 'sage-dayrate-restart',
    headerIds: [],
    employeeAttendance: rows.map((row) => ({
      employeeId: row.code,
      employeeName: row.name,
      daysWorked: Number(row.weekdays || 0),
      attendanceHours: Number(row.weekdays || 0) * 8,
      bookedHours: Number(row.weekdays || 0) * 8,
      idleHours: 0,
    })),
  };
  await writeTimesheetPayrollUpdates([update]);
  invalidateTimesheetHoursCacheForPeriod(PERIOD_ID);
  invalidateTimesheetHoursCacheForPeriod(PERIOD);
  console.log(`Wrote TimesheetPayrollUpdate ${update.id} with ${update.employeeAttendance.length} employees`);

  await removePayrollPeriodEarningAdjustments({ period: PERIOD, source: SAGE_DAYRATE_SOURCE });
  const existing = await readPayrollPeriodEarningAdjustments();
  const imported: PayrollPeriodEarningAdjustment[] = [];
  for (const row of rows) {
    for (const earning of row.earnings) {
      imported.push({
        period: PERIOD,
        employeeId: row.code,
        employeeCode: row.code,
        code: earning.code,
        name: earning.name,
        amount: num(earning.amount),
        taxable: earning.taxable,
        source: SAGE_DAYRATE_SOURCE,
      });
    }
  }
  await writePayrollPeriodEarningAdjustments([...existing, ...imported]);
  console.log(`Wrote ${imported.length} Sage dayrate period earning adjustments`);
  return rows;
};

const resetRunsToOpen = async () => {
  const actor = 'payroll-restart';
  const runs = await ensurePayrollRunsForPeriod(PERIOD, 'July 2026', actor);
  for (const run of runs) {
    const before = run.status;
    run.status = 'Open';
    run.updatedBy = actor;
    run.submittedAt = null;
    run.approvedAt = null;
    await savePayrollRun(run);
    console.log(`Reset ${run.id}: ${before} → Open`);
  }
};

const main = async () => {
  console.log(APPLY ? 'MODE: APPLY' : 'MODE: DRY-RUN (pass --apply to persist)');
  console.log(`Period: ${PERIOD}`);

  await clearInactiveDailyLabels();
  await seedSageTimesheetDays();

  if (!APPLY) {
    console.log('\nDry-run complete. Re-run with --apply to scrub labels, seed days, validate, and recompute.');
    return;
  }

  invalidatePayrollEmployeeCache();
  await resetRunsToOpen();

  console.log('\n--- validate-payroll ---');
  const validated = await executePayrollWorkflowAction({
    action: 'validate-payroll',
    period: PERIOD,
    actor: 'payroll-restart',
    role: 'Super Admin',
    isGlobalAdmin: true,
    reason: 'Restart July 2026 from validation after Sage roster + day-count feed',
  });
  for (const run of validated.runs || [validated.run]) {
    console.log(`Validated ${run.id}: status=${run.status} staff=${run.employeeCount} gross=${run.grossPay} net=${run.netPay} exceptions=${run.exceptionCount}`);
  }

  console.log('\n--- create-run (compute) ---');
  const computed = await executePayrollWorkflowAction({
    action: 'create-run',
    period: PERIOD,
    actor: 'payroll-restart',
    role: 'Super Admin',
    isGlobalAdmin: true,
    reason: 'Recompute July 2026 salaried + daily-rate after validation restart',
  });
  for (const run of computed.runs || [computed.run]) {
    console.log(`Computed ${run.id}: status=${run.status} staff=${run.employeeCount} gross=${run.grossPay} net=${run.netPay} exceptions=${run.exceptionCount}`);
  }

  console.log('\n--- pack summaries ---');
  for (const pack of ['salaried', 'daily-rate'] as const) {
    const calc = await calculatePayrollForPeriod(PERIOD, { forceRefresh: true, pack });
    const s = calc.summary;
    console.log(
      `${pack}: employees=${s.employees} ready=${s.readyEmployees} review=${s.reviewEmployees} blocked=${s.blockedEmployees} gross=${s.grossPay} net=${s.netPay} issues=${s.exceptionCount} deferred=${s.deferredExceptionCount}`,
    );
    const topIssues = new Map<string, number>();
    for (const record of calc.records) {
      for (const issue of record.exceptions || []) {
        topIssues.set(issue, (topIssues.get(issue) || 0) + 1);
      }
    }
    const ranked = [...topIssues.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
    if (ranked.length) {
      console.log('  top blocking issues:');
      for (const [issue, count] of ranked) console.log(`    ${count}× ${issue}`);
    }
  }

  const dailyRun = await getPayrollRunForPeriod(PERIOD, 'daily-rate');
  const salariedRun = await getPayrollRunForPeriod(PERIOD, 'salaried');
  console.log('\n--- final run rows ---');
  console.log(`salaried: ${salariedRun?.status} staff=${salariedRun?.employeeCount} gross=${salariedRun?.grossPay}`);
  console.log(`daily-rate: ${dailyRun?.status} staff=${dailyRun?.employeeCount} gross=${dailyRun?.grossPay}`);
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
