import path from 'node:path';
import sql from 'mssql';
import { getDleEnterpriseDbPool } from '@/lib/dle-enterprise-db';
import { readBackupDisasterRecoveryState, writeBackupDisasterRecoveryState } from '@/lib/backup-disaster-recovery-store';
import type { BackupDisasterRecoveryState, BackupExecutionJob, BackupIncident, BackupMetric, BackupRestoreReadiness } from '@/lib/backup-disaster-recovery-types';

const PRIMARY_TARGET = 'Primary Backup';

const compact = <T,>(items: T[], limit: number) => items.slice(0, limit);

const backupFilePath = (location: string, databaseName: string) => {
  const cleaned = location.trim();
  if (/\.bak$/i.test(cleaned)) return cleaned;
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const separator = cleaned.endsWith('\\') || cleaned.endsWith('/') ? '' : '\\';
  return `${cleaned}${separator}${databaseName}_FULL_${stamp}.bak`;
};

const backupDirectory = (location: string) => (/\.bak$/i.test(location.trim()) ? path.win32.dirname(location.trim()) : location.trim());

const metricSnapshot = (status: 'Running' | 'Failed' | 'Completed', detail: string, completedAt?: string): BackupMetric[] => [
  { label: 'Backup Service', value: status, detail, tone: status === 'Failed' ? 'red' : status === 'Completed' ? 'green' : 'blue' },
  { label: 'Last Verified Backup', value: completedAt ? 'Passed' : status, detail: completedAt ? `Verified ${new Date(completedAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}` : detail, tone: completedAt ? 'green' : status === 'Failed' ? 'red' : 'blue' },
];

const jobRecord = (status: string, filePath: string, at: string): BackupExecutionJob => ({
  job: 'DLE_Enterprise Full Database Backup',
  owner: 'SQL Server backup worker',
  nextRun: at,
  retry: filePath,
  status,
});

const restoreRecord = (filePath: string, at: string): BackupRestoreReadiness => ({
  control: 'DLE_Enterprise full database restore verification',
  result: 'Passed',
  evidence: `RESTORE VERIFYONLY completed for ${filePath} at ${new Date(at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}.`,
});

const incidentRecord = (message: string, at: string): BackupIncident => ({
  severity: 'Critical',
  message,
  owner: 'SQL Server backup worker',
  status: `Open ${new Date(at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}`,
});

const targetWithPrimary = (state: BackupDisasterRecoveryState) => {
  const primary = state.replicationTargets.find((target) => target.target === PRIMARY_TARGET);
  if (primary?.location.trim()) return primary;
  return state.replicationTargets.find((target) => target.location.trim());
};

export const runDleEnterpriseFullBackup = async (actor: string) => {
  const pool = await getDleEnterpriseDbPool();
  if (!pool) throw new Error('DLE_Enterprise database is not available.');

  const initialState = await readBackupDisasterRecoveryState();
  const target = targetWithPrimary(initialState);
  if (!target) throw new Error('Configure at least one backup location before running a backup.');

  const databaseResult = await pool.request().query('SELECT DB_NAME() AS databaseName');
  const databaseName = String(databaseResult.recordset[0]?.databaseName || 'DLE_Enterprise');
  const filePath = backupFilePath(target.location, databaseName);
  const startedAt = new Date().toISOString();

  await writeBackupDisasterRecoveryState({
    ...initialState,
    serviceMetrics: metricSnapshot('Running', `Writing backup to ${backupDirectory(filePath)}`),
    executionQueue: compact([jobRecord('Running', filePath, startedAt), ...initialState.executionQueue], 20),
  }, actor);

  const startedMs = Date.now();
  try {
    const request = pool.request();
    (request as typeof request & { timeout: number }).timeout = Number(process.env.DLE_ENTERPRISE_BACKUP_TIMEOUT_MS || 900000);
    await request
      .input('BackupPath', sql.NVarChar(4000), filePath)
      .query(`
DECLARE @DatabaseName sysname = DB_NAME();
DECLARE @BackupSql nvarchar(max) = N'BACKUP DATABASE ' + QUOTENAME(@DatabaseName) + N' TO DISK = @BackupPath WITH INIT, CHECKSUM, STATS = 10;';
EXEC sp_executesql @BackupSql, N'@BackupPath nvarchar(4000)', @BackupPath = @BackupPath;
RESTORE VERIFYONLY FROM DISK = @BackupPath WITH CHECKSUM;
`);

    const completedAt = new Date().toISOString();
    const elapsedSeconds = Math.max(1, Math.round((Date.now() - startedMs) / 1000));
    const latest = await readBackupDisasterRecoveryState();
    const nextTargets = latest.replicationTargets.map((item) => item.target === target.target ? {
      ...item,
      location: target.location,
      status: 'Verified',
      lastCopy: completedAt,
      lag: '0 min',
    } : item);
    return writeBackupDisasterRecoveryState({
      ...latest,
      serviceMetrics: metricSnapshot('Completed', `Full backup completed in ${elapsedSeconds}s`, completedAt),
      replicationTargets: nextTargets,
      executionQueue: compact([jobRecord('Completed', filePath, completedAt), ...latest.executionQueue.filter((job) => job.status !== 'Running')], 20),
      restoreReadiness: compact([restoreRecord(filePath, completedAt), ...latest.restoreReadiness], 20),
      audit: compact([{ at: completedAt, actor, action: 'Full database backup completed', detail: filePath }, ...latest.audit], 100),
    }, actor);
  } catch (error) {
    const failedAt = new Date().toISOString();
    const message = error instanceof Error ? error.message : 'Full database backup failed.';
    const latest = await readBackupDisasterRecoveryState();
    return writeBackupDisasterRecoveryState({
      ...latest,
      serviceMetrics: metricSnapshot('Failed', message),
      executionQueue: compact([jobRecord('Failed', filePath, failedAt), ...latest.executionQueue.filter((job) => job.status !== 'Running')], 20),
      incidents: compact([incidentRecord(message, failedAt), ...latest.incidents], 50),
      audit: compact([{ at: failedAt, actor, action: 'Full database backup failed', detail: message }, ...latest.audit], 100),
    }, actor);
  }
};
