/**
 * Demobilize C1686 Micah Fred. Last offshore day 30 Aug 2026; home from 31 Aug.
 *
 *   npx tsx --tsconfig apps/dashboard/tsconfig.json scripts/demobilize-c1686.mts --apply
 */
import { loadWorkspaceEnv } from '../apps/dashboard/lib/dle-enterprise-db';
import { demobilizeTimesheetMobilization, readTimesheetMobilizations } from '../apps/dashboard/lib/timesheet-mobilization-store';

loadWorkspaceEnv();

const APPLY = process.argv.includes('--apply');
const CODE = 'C1686';
const LAST_OFFSHORE_DAY = '2026-08-30';
const ACTOR = 'HR (supervisor request: demobilized from 31 Aug 2026)';

const main = async () => {
  const rows = (await readTimesheetMobilizations({ employeeCode: CODE }))
    .filter((item) => item.status === 'Planned' || item.status === 'Mobilized');
  if (!rows.length) {
    console.log(JSON.stringify({ apply: APPLY, code: CODE, action: 'none', reason: 'No active mobilization.' }, null, 2));
    return;
  }
  const updated = [];
  for (const row of rows) {
    if (APPLY) {
      await demobilizeTimesheetMobilization(row.id, ACTOR, LAST_OFFSHORE_DAY);
    }
    updated.push({
      id: row.id,
      employee: `${row.employeeName} (${row.employeeCode})`,
      supervisor: row.supervisorName,
      project: row.projectCode,
      from: `${row.startDate} → ${row.endDate || 'open'} (${row.status})`,
      to: `${row.startDate} → ${LAST_OFFSHORE_DAY} (Demobilized)`,
      homeFrom: '2026-08-31',
    });
  }
  console.log(JSON.stringify({ apply: APPLY, lastOffshoreDay: LAST_OFFSHORE_DAY, updated }, null, 2));
};

main().then(() => process.exit(0)).catch((error) => {
  console.error(error);
  process.exit(1);
});
