import sql from 'mssql';
import { getDleEnterpriseDbPool } from '@/lib/dle-enterprise-db';
import { defaultBackupDisasterRecoveryState } from '@/lib/backup-disaster-recovery-defaults';
import type { BackupAuditEvent, BackupDisasterRecoveryState, BackupPolicy } from '@/lib/backup-disaster-recovery-types';

const STATE_KEY = 'backup-disaster-recovery-centre';

const SEEDED_METRIC_LABELS = new Set(['Backup Service', 'Health Check', 'Storage Usage', 'Last Verified Backup']);
const SEEDED_POLICY_TYPES = new Set([
  'Database Full Backup',
  'Differential Backup',
  'Transaction Log Backup',
  'Application Backup',
  'Document Repository Backup',
  'Configuration Backup',
  'System Snapshot',
]);
const SEEDED_QUEUE_JOBS = new Set(['Transaction Log Backup', 'Health Probe', 'Document Repository Backup', 'Full Database Backup']);
const SEEDED_RESTORE_CONTROLS = new Set(['Full database restore drill', 'Document repository recovery', 'Configuration rollback package', 'RPO / RTO status']);
const SEEDED_REPLICATION_LOCATIONS = new Set(['D:\\DLE_Backups', '\\\\BackupServer\\DLEConnect', '\\\\DRServer\\DLEConnect', 'Azure Blob Storage']);

let schemaReady = false;

const ensureSchema = async (pool: sql.ConnectionPool) => {
  if (schemaReady) return;
  await pool.request().query(`
IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = N'admin')
  EXEC(N'CREATE SCHEMA [admin]');

IF OBJECT_ID(N'[admin].[BackupDisasterRecoveryState]', N'U') IS NULL
BEGIN
  CREATE TABLE [admin].[BackupDisasterRecoveryState] (
    [StateKey] NVARCHAR(120) NOT NULL CONSTRAINT [PK_BackupDisasterRecoveryState] PRIMARY KEY,
    [StateJson] NVARCHAR(MAX) NOT NULL,
    [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_BackupDisasterRecoveryState_CreatedAt] DEFAULT SYSUTCDATETIME(),
    [UpdatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_BackupDisasterRecoveryState_UpdatedAt] DEFAULT SYSUTCDATETIME(),
    [UpdatedBy] NVARCHAR(160) NOT NULL CONSTRAINT [DF_BackupDisasterRecoveryState_UpdatedBy] DEFAULT N'System',
    CONSTRAINT [CK_BackupDisasterRecoveryState_StateJson] CHECK (ISJSON([StateJson]) = 1)
  );
END;
`);
  schemaReady = true;
};

const cleanPolicy = (policy: BackupPolicy): BackupPolicy => ({
  type: String(policy.type || '').trim(),
  schedule: String(policy.schedule || '').trim(),
  validation: String(policy.validation || '').trim(),
  retention: String(policy.retention || '').trim(),
  status: String(policy.status || 'Configured').trim() || 'Configured',
  lastRunAt: policy.lastRunAt ? String(policy.lastRunAt) : undefined,
  lastRunStatus: policy.lastRunStatus === 'success' || policy.lastRunStatus === 'failed' || policy.lastRunStatus === 'skipped'
    ? policy.lastRunStatus
    : undefined,
  lastRunDetail: policy.lastRunDetail ? String(policy.lastRunDetail) : undefined,
});

export const validateBackupPolicies = (policies: BackupPolicy[]) => {
  const cleaned = policies.map(cleanPolicy).filter((policy) => policy.type || policy.schedule || policy.validation || policy.retention);
  for (const [index, policy] of cleaned.entries()) {
    const missing = ['type', 'schedule', 'validation', 'retention'].filter((field) => !policy[field as keyof BackupPolicy]);
    if (missing.length) {
      throw new Error(`Backup policy ${index + 1} is incomplete. Select ${missing.join(', ')}.`);
    }
  }
  return cleaned;
};

const normalizeState = (value: unknown): BackupDisasterRecoveryState => {
  const fallback = defaultBackupDisasterRecoveryState();
  const parsed = value && typeof value === 'object' ? value as Partial<BackupDisasterRecoveryState> : {};
  const replicationTargets = Array.isArray(parsed.replicationTargets) ? parsed.replicationTargets.map((target) => {
    if (target && SEEDED_REPLICATION_LOCATIONS.has(target.location)) {
      return { ...target, location: '', status: 'Not configured', lastCopy: '', lag: '' };
    }
    if (target?.location?.trim() && target.status === 'Not configured') {
      return { ...target, status: 'Configured' };
    }
    return target;
  }) : fallback.replicationTargets;
  return {
    ...fallback,
    ...parsed,
    schemaVersion: 1,
    serviceMetrics: Array.isArray(parsed.serviceMetrics) ? parsed.serviceMetrics.filter((metric) => !SEEDED_METRIC_LABELS.has(metric.label)) : fallback.serviceMetrics,
    backupPolicies: Array.isArray(parsed.backupPolicies)
      ? (
        parsed.backupPolicies.filter((policy) => !SEEDED_POLICY_TYPES.has(policy.type)).length
          ? parsed.backupPolicies.filter((policy) => !SEEDED_POLICY_TYPES.has(policy.type)).map(cleanPolicy)
          : fallback.backupPolicies
      )
      : fallback.backupPolicies,
    replicationTargets: replicationTargets.length ? replicationTargets : fallback.replicationTargets,
    executionQueue: Array.isArray(parsed.executionQueue) ? parsed.executionQueue.filter((job) => !SEEDED_QUEUE_JOBS.has(job.job)) : fallback.executionQueue,
    failureRecoveryRules: Array.isArray(parsed.failureRecoveryRules) ? parsed.failureRecoveryRules : fallback.failureRecoveryRules,
    storageAutomation: Array.isArray(parsed.storageAutomation) ? parsed.storageAutomation : fallback.storageAutomation,
    incidents: Array.isArray(parsed.incidents)
      ? parsed.incidents.filter((incident) => !incident.message.includes('80% in 19 days') && !incident.message.includes('42 expired backup files') && !incident.message.includes('DR replication completed successfully'))
      : fallback.incidents,
    restoreReadiness: Array.isArray(parsed.restoreReadiness) ? parsed.restoreReadiness.filter((item) => !SEEDED_RESTORE_CONTROLS.has(item.control)) : fallback.restoreReadiness,
    audit: Array.isArray(parsed.audit) ? parsed.audit : fallback.audit,
    lastOperation: parsed.lastOperation && typeof parsed.lastOperation === 'object' ? parsed.lastOperation : fallback.lastOperation,
    payrollCutover: parsed.payrollCutover && typeof parsed.payrollCutover === 'object'
      ? {
          enabled: parsed.payrollCutover.enabled !== false,
          requireBeforeNextPeriodOpen: parsed.payrollCutover.requireBeforeNextPeriodOpen !== false,
          records: Array.isArray(parsed.payrollCutover.records) ? parsed.payrollCutover.records : [],
        }
      : fallback.payrollCutover,
    updatedAt: parsed.updatedAt || fallback.updatedAt,
    updatedBy: parsed.updatedBy || fallback.updatedBy,
  };
};

const statesEqual = (left: BackupDisasterRecoveryState, rightJson: string) => {
  try {
    return JSON.stringify(left) === JSON.stringify(normalizeState(JSON.parse(rightJson)));
  } catch {
    return false;
  }
};

export const readBackupDisasterRecoveryState = async () => {
  const pool = await getDleEnterpriseDbPool();
  if (!pool) throw new Error('DLE_Enterprise database is not available.');
  await ensureSchema(pool);
  const result = await pool.request()
    .input('StateKey', sql.NVarChar(120), STATE_KEY)
    .query(`SELECT [StateJson] FROM [admin].[BackupDisasterRecoveryState] WHERE [StateKey] = @StateKey`);
  const row = result.recordset[0];
  if (row?.StateJson) {
    try {
      const normalized = normalizeState(JSON.parse(row.StateJson));
      if (!statesEqual(normalized, row.StateJson)) {
        await writeBackupDisasterRecoveryState(normalized, 'System cleanup');
      }
      return normalized;
    } catch {
      return normalizeState(null);
    }
  }
  const seeded = normalizeState(null);
  await writeBackupDisasterRecoveryState(seeded, 'System seed');
  return seeded;
};

export const writeBackupDisasterRecoveryState = async (state: BackupDisasterRecoveryState, actor: string) => {
  const pool = await getDleEnterpriseDbPool();
  if (!pool) throw new Error('DLE_Enterprise database is not available.');
  await ensureSchema(pool);
  const next = normalizeState({
    ...state,
    updatedAt: new Date().toISOString(),
    updatedBy: actor,
  });
  await pool.request()
    .input('StateKey', sql.NVarChar(120), STATE_KEY)
    .input('StateJson', sql.NVarChar(sql.MAX), JSON.stringify(next))
    .input('UpdatedBy', sql.NVarChar(160), actor)
    .query(`
MERGE [admin].[BackupDisasterRecoveryState] AS target
USING (SELECT @StateKey AS [StateKey]) AS source
ON target.[StateKey] = source.[StateKey]
WHEN MATCHED THEN
  UPDATE SET [StateJson] = @StateJson, [UpdatedAt] = SYSUTCDATETIME(), [UpdatedBy] = @UpdatedBy
WHEN NOT MATCHED THEN
  INSERT ([StateKey], [StateJson], [UpdatedBy])
  VALUES (@StateKey, @StateJson, @UpdatedBy);
`);
  return next;
};

export const appendBackupDisasterRecoveryAudit = async (event: Omit<BackupAuditEvent, 'at'>) => {
  const state = await readBackupDisasterRecoveryState();
  const nextAudit = [
    { ...event, at: new Date().toISOString() },
    ...state.audit,
  ].slice(0, 100);
  return writeBackupDisasterRecoveryState({ ...state, audit: nextAudit }, event.actor);
};

export const readBackupDisasterRecoveryStateSafe = async () => {
  try {
    return await readBackupDisasterRecoveryState();
  } catch (error) {
    const fallback = defaultBackupDisasterRecoveryState();
    fallback.incidents = [{
      severity: 'Warning',
      message: error instanceof Error ? error.message : 'Unable to load backup centre state from DLE_Enterprise.',
      owner: 'Backup centre',
      status: 'Open',
    }];
    return fallback;
  }
};
