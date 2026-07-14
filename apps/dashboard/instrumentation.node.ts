/**
 * Node.js-only startup hooks. Keep this file free of Edge imports.
 * Loaded exclusively from instrumentation.ts when NEXT_RUNTIME === 'nodejs'.
 */
export async function registerNodeInstrumentation() {
  const { ensureBackupSchedulerStarted } = await import('@/lib/backup-scheduler');
  ensureBackupSchedulerStarted();
}
