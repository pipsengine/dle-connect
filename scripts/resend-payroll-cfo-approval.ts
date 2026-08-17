/**
 * Resend CFO payroll approval emails for Finance Approved runs.
 * Run from apps/dashboard so @/ path aliases resolve:
 *   cd apps/dashboard && npx tsx ../../scripts/resend-payroll-cfo-approval.ts
 */
import { listPayrollRuns } from '@/lib/payroll-run-store';
import { notifyPayrollApprovalStage, resolvePayrollApproverRecipients } from '@/lib/payroll-approval-notification-service';
import { resolveWorkflowLinkOrigin } from '@/lib/public-app-url';

async function main() {
  const recipients = await resolvePayrollApproverRecipients('cfo');
  console.log('CFO recipients:', recipients.map((item) => ({
    name: item.fullName,
    email: item.email,
    username: item.username,
    roles: item.roles,
  })));

  const mdRecipients = await resolvePayrollApproverRecipients('md-ceo');
  console.log('MD recipients:', mdRecipients.map((item) => ({
    name: item.fullName,
    email: item.email,
    username: item.username,
    roles: item.roles,
  })));

  const runs = (await listPayrollRuns()).filter((run) => run.status === 'Finance Approved');
  console.log(`Finance Approved runs: ${runs.length}`);
  const baseUrl = resolveWorkflowLinkOrigin();

  const results = [];
  for (const run of runs) {
    const result = await notifyPayrollApprovalStage({
      run,
      stageId: 'cfo',
      actor: 'System Ops (resend to named CFO)',
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
