/**
 * Close a prior timesheet period after snapshotting booked hours for payroll.
 *
 *   npx tsx --tsconfig apps/dashboard/tsconfig.json scripts/close-timesheet-period.mts --period 2026-08 --apply
 */
import fs from 'node:fs';
import path from 'node:path';
import sql from 'mssql';

import { getDleEnterpriseDbPool } from '../apps/dashboard/lib/dle-enterprise-db';
import {
  calculateTimesheetPeriod,
  readTimesheetPeriods,
  updateTimesheetPeriodStatus,
} from '../apps/dashboard/lib/timesheet-entry-store';

const loadWorkspaceEnv = () => {
  for (const file of [path.resolve('.env'), path.resolve('apps/dashboard/.env')]) {
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!match) continue;
      let value = match[2].trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!process.env[match[1]]) process.env[match[1]] = value;
    }
  }
};

const arg = (flag: string, fallback = '') => {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? String(process.argv[index + 1] || '') : fallback;
};

const main = async () => {
  loadWorkspaceEnv();
  const apply = process.argv.includes('--apply');
  const periodToken = arg('--period', '2026-08');
  const actor = arg('--actor', 'HR (close prior timesheet period)');
  const match = /^(\d{4})-(\d{2})$/.exec(periodToken);
  if (!match) throw new Error('Period must be YYYY-MM, e.g. 2026-08');
  const periodDate = new Date(Number(match[1]), Number(match[2]) - 1, 15);
  const target = calculateTimesheetPeriod(periodDate);
  const current = calculateTimesheetPeriod(new Date());
  const before = await readTimesheetPeriods();
  const pool = await getDleEnterpriseDbPool();
  const headerSummary = pool
    ? (await new sql.Request(pool)
      .input('PeriodId', sql.NVarChar(40), target.id)
      .query(`
SELECT COUNT(*) AS headers,
       SUM(CASE WHEN Status = 'Draft' THEN 1 ELSE 0 END) AS drafts,
       SUM(CASE WHEN Status IN ('Rejected','Returned') THEN 1 ELSE 0 END) AS excluded,
       MIN(TimesheetDate) AS firstDate,
       MAX(TimesheetDate) AS lastDate
FROM [hris].[TimesheetHeaders]
WHERE PeriodId = @PeriodId;
`)).recordset[0]
    : null;

  console.log(JSON.stringify({
    mode: apply ? 'APPLY' : 'DRY RUN',
    close: target,
    keepCurrent: current,
    headers: headerSummary,
    openBefore: before.filter((period) => period.status === 'Open').map((period) => period.id),
  }, null, 2));

  if (!apply) {
    console.log('Re-run with --apply to snapshot booked hours and close this period.');
    process.exit(0);
  }

  const closed = await updateTimesheetPeriodStatus(periodDate, 'Closed', actor);
  const after = await readTimesheetPeriods();
  console.log(JSON.stringify({
    closed: { id: closed.id, status: closed.status, closedBy: closed.closedBy, closedAt: closed.closedAt },
    openAfter: after.filter((period) => period.status === 'Open').map((period) => ({ id: period.id, status: period.status })),
  }, null, 2));
  process.exit(0);
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
