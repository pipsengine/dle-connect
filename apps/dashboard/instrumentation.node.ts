/**
 * Node.js-only startup hooks. Keep this file free of Edge imports.
 * Loaded exclusively from instrumentation.ts when NEXT_RUNTIME === 'nodejs'.
 */
export async function registerNodeInstrumentation() {
  const { ensureBackupSchedulerStarted } = await import('@/lib/backup-scheduler');
  ensureBackupSchedulerStarted();
  const { ensurePaymentReminderSchedulerStarted } = await import('@/lib/finance-intelligence/payment-approval-reminder-scheduler');
  ensurePaymentReminderSchedulerStarted();
  const { ensurePayrollReminderSchedulerStarted } = await import('@/lib/payroll-approval-reminder-scheduler');
  ensurePayrollReminderSchedulerStarted();
  const { ensureCelebrationSchedulerStarted } = await import('@/lib/celebration-scheduler');
  ensureCelebrationSchedulerStarted();
  void import('@/lib/payroll-approval-notification-service')
    .then(({ repairPayrollApprovalNotificationPrivacy }) => repairPayrollApprovalNotificationPrivacy())
    .then((result) => {
      if (result.removed || result.stripped) {
        console.info('[instrumentation] Purged leaked payroll approval notifications.', result);
      }
    })
    .catch((error) => console.warn('[instrumentation] Payroll notification privacy repair skipped.', error));
}
