/**
 * Submit every booked Draft timesheet through the same Review & Submit path
 * used by Timesheet Entry (validation, project manager, Supervisor stage).
 *
 *   npx tsx --tsconfig apps/dashboard/tsconfig.json scripts/submit-booked-draft-timesheets.mts
 *   npx tsx --tsconfig apps/dashboard/tsconfig.json scripts/submit-booked-draft-timesheets.mts --apply
 */
import { loadWorkspaceEnv } from '../apps/dashboard/lib/dle-enterprise-db';
import { submitAllBookedDraftTimesheets } from '../apps/dashboard/lib/timesheet-submit';

const arg = (flag: string, fallback = '') => {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? String(process.argv[index + 1] || '') : fallback;
};

const main = async () => {
  loadWorkspaceEnv();
  const apply = process.argv.includes('--apply');
  const skipNotify = process.argv.includes('--skip-notify');
  const actor = arg('--actor', 'HR (bulk submit booked drafts)');
  const result = await submitAllBookedDraftTimesheets({
    apply,
    actor,
    notify: !skipNotify,
  });

  console.log(JSON.stringify({
    mode: apply ? 'APPLY' : 'DRY RUN',
    total: result.total,
    submitted: result.submitted.length,
    skipped: result.skipped.length,
    clashRepairs: result.clashRepairs.length,
    skipReasons: Object.fromEntries(
      Object.entries(result.skipped.reduce<Record<string, number>>((counts, row) => {
        const key = row.reason?.startsWith('Timesheet period')
          ? 'Closed period'
          : row.reason?.includes('already booked')
            ? 'Same-day duplicate booking'
            : row.reason?.includes('nothing left to submit')
              ? 'Duplicate crew removed'
              : row.reason?.includes('exceeds biometric')
                ? 'Biometric duration'
                : 'Other';
        counts[key] = (counts[key] || 0) + 1;
        return counts;
      }, {})),
    ),
    submittedRows: result.submitted,
    skippedRows: result.skipped,
  }, null, 2));

  if (!apply) {
    console.log('Re-run with --apply to persist Submitted status and notify supervisors.');
  }

  process.exit(result.skipped.length && apply ? 1 : 0);
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
