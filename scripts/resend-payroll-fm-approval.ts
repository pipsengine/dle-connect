/**
 * Resend Finance Manager payroll approval emails for HR Approved runs.
 * Run from apps/dashboard so @/ path aliases resolve:
 *   cd apps/dashboard && npx tsx ../../scripts/resend-payroll-fm-approval.ts
 */
import { listPayrollRuns } from '@/lib/payroll-run-store';
import { notifyPayrollApprovalStage, resolvePayrollApproverRecipients } from '@/lib/payroll-approval-notification-service';
import { resolvePublicAppOrigin } from '@/lib/public-app-url';

async function main() {
  const recipients = await resolvePayrollApproverRecipients('finance-manager');
  console.log('FM recipients:', recipients.map((item) => ({
    name: item.fullName,
    email: item.email,
    username: item.username,
    roles: item.roles,
  })));

  const runs = (await listPayrollRuns()).filter((run) => run.status === 'HR Approved');
  console.log(`HR Approved runs: ${runs.length}`);
  const baseUrl = resolvePublicAppOrigin()
    || process.env.DLE_PUBLIC_APP_URL
    || 'http://192.168.5.5:3020';

  const results = [];
  for (const run of runs) {
    const result = await notifyPayrollApprovalStage({
      run,
      stageId: 'finance-manager',
      actor: 'System Ops (resend to acting Finance Manager)',
      baseUrl,
    });
    results.push({
      runId: run.id,
      period: run.period,
      pack: run.pack,
      periodLabel: run.periodLabel,
      notified: result.notified,
      emailed: result.emailed,
    });
  }
  console.log(JSON.stringify({ baseUrl, results }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
