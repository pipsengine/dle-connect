/**
 * Approve every in-progress timesheet for a period through the remaining
 * workflow stages, lock them as payroll posted, rebuild the payroll snapshot,
 * and post permanent-staff timesheet overtime and night allowance.
 *
 * Empty drafts are left unchanged. Booked drafts are submitted, approved, and posted.
 *
 *   npx tsx --tsconfig apps/dashboard/tsconfig.json scripts/approve-and-post-timesheets.mts
 *   npx tsx --tsconfig apps/dashboard/tsconfig.json scripts/approve-and-post-timesheets.mts --apply
 *   npx tsx --tsconfig apps/dashboard/tsconfig.json scripts/approve-and-post-timesheets.mts --apply --period per-2026-09
 *   npx tsx --tsconfig apps/dashboard/tsconfig.json scripts/approve-and-post-timesheets.mts --apply --all-pending
 */
import { getDleEnterpriseDbPool, loadWorkspaceEnv } from '../apps/dashboard/lib/dle-enterprise-db';
import { readOpenTimesheetPeriod } from '../apps/dashboard/lib/timesheet-entry-store';
import { approveAndPostTimesheetsForPeriod, planBulkPayrollPost } from '../apps/dashboard/lib/timesheet-bulk-payroll-post';

const arg = (flag: string, fallback = '') => {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? String(process.argv[index + 1] || '') : fallback;
};

const listPendingPeriodIds = async (actor: string) => {
  const pool = await getDleEnterpriseDbPool();
  if (!pool) throw new Error('DLE Enterprise database is not available.');
  const result = await pool.request().query(`
    SELECT DISTINCT [PeriodId]
    FROM [hris].[TimesheetHeaders]
    WHERE [Status] NOT IN (N'Locked', N'Rejected', N'Returned')
    ORDER BY [PeriodId] DESC
  `);
  const periodIds = (result.recordset as Array<{ PeriodId: string }>)
    .map((row) => String(row.PeriodId || '').trim())
    .filter(Boolean);
  const pending: string[] = [];
  for (const periodId of periodIds) {
    const plan = await planBulkPayrollPost(periodId, actor);
    if (plan.toPost > 0) pending.push(periodId);
  }
  return pending;
};

const main = async () => {
  loadWorkspaceEnv();
  const apply = process.argv.includes('--apply');
  const allPending = process.argv.includes('--all-pending');
  const actor = arg('--actor', 'Payroll (bulk approve and post)');
  const periodArg = arg('--period');
  const periods = allPending
    ? await listPendingPeriodIds(actor)
    : [periodArg
      ? (periodArg.startsWith('per-') ? periodArg : `per-${periodArg}`)
      : (await readOpenTimesheetPeriod()).id];

  try {
    if (!periods.length) {
      console.log(JSON.stringify({ mode: apply ? 'APPLY' : 'DRY RUN', periods: [], toPost: 0 }, null, 2));
      return;
    }
    const results = [];
    for (const periodId of periods) {
      const result = await approveAndPostTimesheetsForPeriod({ periodId, actor, apply });
      results.push(result);
    }
    console.log(JSON.stringify({
      mode: apply ? 'APPLY' : 'DRY RUN',
      periods,
      totalToPost: results.reduce((sum, row) => sum + row.toPost, 0),
      results,
    }, null, 2));
    if (!apply) console.log('Re-run with --apply to approve and post these timesheets to payroll.');
  } finally {
    const pool = await getDleEnterpriseDbPool();
    if (pool) await pool.close();
  }
};

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exit(1);
});
