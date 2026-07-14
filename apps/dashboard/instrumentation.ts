export async function register() {
  if (process.env.NEXT_RUNTIME === 'edge') return;
  const { ensureBackupSchedulerStarted } = await import('@/lib/backup-scheduler');
  ensureBackupSchedulerStarted();
}
