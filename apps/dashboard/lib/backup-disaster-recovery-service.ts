import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import sql from 'mssql';
import { getDleEnterpriseDbPool } from '@/lib/dle-enterprise-db';
import { readBackupDisasterRecoveryState, validateBackupPolicies, writeBackupDisasterRecoveryState } from '@/lib/backup-disaster-recovery-store';
import type {
  BackupDisasterRecoveryState,
  BackupExecutionJob,
  BackupFailureRecoveryRule,
  BackupIncident,
  BackupMetric,
  BackupPolicy,
  BackupReplicationTarget,
  BackupRestoreReadiness,
  BackupStorageAutomation,
} from '@/lib/backup-disaster-recovery-types';

const PRIMARY_TARGET = 'Primary Backup';
const DATABASE_NAME = 'DLE_Enterprise';

const compact = <T,>(items: T[], limit: number) => items.slice(0, limit);

const formatBytes = (bytes: number) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return 'Unknown size';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
};

const formatDuration = (minutes: number) => {
  if (!Number.isFinite(minutes) || minutes < 0) return 'Not available';
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return mins ? `${hours}h ${mins}m` : `${hours}h`;
};

const backupFilePath = (location: string, databaseName: string) => {
  const cleaned = location.trim();
  if (/\.bak$/i.test(cleaned)) return cleaned;
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const separator = cleaned.endsWith('\\') || cleaned.endsWith('/') ? '' : '\\';
  return `${cleaned}${separator}${databaseName}_FULL_${stamp}.bak`;
};

const backupDirectory = (location: string) => (/\.bak$/i.test(location.trim()) ? path.win32.dirname(location.trim()) : location.trim());

const ensureBackupDirectory = (location: string) => {
  const directory = backupDirectory(location);
  if (!directory) throw new Error('Backup location is empty.');
  if (!existsSync(directory)) {
    mkdirSync(directory, { recursive: true });
  }
};

const metricSnapshot = (status: 'Running' | 'Failed' | 'Completed' | 'Idle', detail: string, completedAt?: string): BackupMetric[] => [
  { label: 'Backup Service', value: status, detail, tone: status === 'Failed' ? 'red' : status === 'Completed' ? 'green' : status === 'Idle' ? 'slate' : 'blue' },
  { label: 'Last Verified Backup', value: completedAt ? 'Passed' : status === 'Failed' ? 'Failed' : 'Pending', detail: completedAt ? `Verified ${new Date(completedAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}` : detail, tone: completedAt ? 'green' : status === 'Failed' ? 'red' : 'amber' },
];

const jobRecord = (job: string, status: string, filePath: string, at: string, owner = 'SQL Server backup worker'): BackupExecutionJob => ({
  job,
  owner,
  nextRun: at,
  retry: filePath,
  status,
});

const restoreRecord = (filePath: string, at: string, result: 'Passed' | 'Failed', detail?: string): BackupRestoreReadiness => ({
  control: 'DLE_Enterprise full database restore verification',
  result,
  evidence: detail || `RESTORE VERIFYONLY ${result.toLowerCase()} for ${filePath} at ${new Date(at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}.`,
});

const incidentRecord = (message: string, at: string, severity: BackupIncident['severity'] = 'Critical'): BackupIncident => ({
  severity,
  message,
  owner: 'SQL Server backup worker',
  status: `Open ${new Date(at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}`,
});

const targetWithPrimary = (state: BackupDisasterRecoveryState) => {
  const primary = state.replicationTargets.find((target) => target.target === PRIMARY_TARGET);
  if (primary?.location.trim()) return primary;
  return state.replicationTargets.find((target) => target.location.trim());
};

const normalizePathKey = (value: string) => value.trim().replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();

const pathMatchesTarget = (backupPath: string, targetLocation: string) => {
  const backupKey = normalizePathKey(path.win32.dirname(backupPath));
  const targetKey = normalizePathKey(backupDirectory(targetLocation));
  if (!backupKey || !targetKey) return false;
  return backupKey === targetKey || backupKey.startsWith(`${targetKey}/`) || targetKey.startsWith(`${backupKey}/`);
};

const computeNextRun = (schedule: string, from = new Date()) => {
  const text = schedule.trim().toLowerCase();
  const next = new Date(from);
  if (!text) return '';
  if (text.includes('every 15 minutes')) {
    next.setMinutes(Math.ceil(next.getMinutes() / 15) * 15, 0, 0);
    return next.toISOString();
  }
  if (text.includes('every 30 minutes')) {
    next.setMinutes(Math.ceil(next.getMinutes() / 30) * 30, 0, 0);
    return next.toISOString();
  }
  if (text === 'hourly') {
    next.setMinutes(0, 0, 0);
    next.setHours(next.getHours() + 1);
    return next.toISOString();
  }
  if (text.includes('every 6 hours')) {
    next.setMinutes(0, 0, 0);
    next.setHours(Math.ceil(next.getHours() / 6) * 6);
    return next.toISOString();
  }
  if (text.includes('every 12 hours')) {
    next.setMinutes(0, 0, 0);
    next.setHours(next.getHours() >= 12 ? 24 : 12);
    return next.toISOString();
  }
  const dailyMatch = text.match(/daily\s+(\d{2}):(\d{2})/);
  if (dailyMatch) {
    next.setHours(Number(dailyMatch[1]), Number(dailyMatch[2]), 0, 0);
    if (next <= from) next.setDate(next.getDate() + 1);
    return next.toISOString();
  }
  if (text.includes('weekly sunday')) {
    next.setHours(23, 0, 0, 0);
    const day = next.getDay();
    const daysUntilSunday = (7 - day) % 7 || 7;
    next.setDate(next.getDate() + daysUntilSunday);
    return next.toISOString();
  }
  return '';
};

const queueFromPolicies = (policies: BackupPolicy[]): BackupExecutionJob[] =>
  policies
    .filter((policy) => policy.status === 'Automated' || policy.status === 'Configured')
    .map((policy) => ({
      job: policy.type,
      owner: 'DLE Backup Scheduler',
      nextRun: computeNextRun(policy.schedule) || new Date().toISOString(),
      retry: `${policy.validation} · ${policy.retention}`,
      status: policy.status === 'Paused' ? 'Paused' : policy.status === 'Disabled' ? 'Disabled' : 'Scheduled',
    }));

const failureRecoveryFromPolicies = (policies: BackupPolicy[]): BackupFailureRecoveryRule[] =>
  policies
    .filter((policy) => policy.status === 'Automated')
    .map((policy) => ({
      trigger: `${policy.type} failure or validation error`,
      action: `Retry backup, run ${policy.validation}, alert DBA operator`,
      retry: '2 attempts · 5 minute interval',
      status: 'Active',
    }));

const storageAutomationFromPolicies = (policies: BackupPolicy[]): BackupStorageAutomation[] =>
  policies.map((policy) => ({
    scope: policy.type,
    rule: `Retain ${policy.retention}`,
    threshold: policy.schedule,
    status: policy.status === 'Automated' ? 'Active' : policy.status === 'Paused' ? 'Paused' : 'Configured',
  }));

type BackupHistoryRow = {
  backupType: string;
  backupFinishDate: Date | string | null;
  backupSize: number | null;
  physicalDeviceName: string;
};

type AgentJobRow = {
  jobName: string;
  enabled: number | boolean;
  lastRunAt: Date | string | null;
  lastRunStatus: number | null;
  message: string | null;
};

type HealthLogRow = {
  checkedAt: Date | string;
  status: string;
  message: string;
  lastFullBackupAt: Date | string | null;
  fullBackupAgeHours: number | null;
};

const queryBackupHistory = async (pool: sql.ConnectionPool) => {
  try {
    const result = await pool.request()
      .input('DatabaseName', sql.NVarChar(128), DATABASE_NAME)
      .query(`
        SELECT
          bs.type AS backupType,
          bs.backup_finish_date AS backupFinishDate,
          bs.compressed_backup_size AS backupSize,
          mf.physical_device_name AS physicalDeviceName
        FROM msdb.dbo.backupset bs
        JOIN msdb.dbo.backupmediafamily mf ON mf.media_set_id = bs.media_set_id
        WHERE bs.database_name = @DatabaseName
        ORDER BY bs.backup_finish_date DESC;
      `);
    return (result.recordset || []) as BackupHistoryRow[];
  } catch {
    return [] as BackupHistoryRow[];
  }
};

const queryAgentJobs = async (pool: sql.ConnectionPool) => {
  try {
    const result = await pool.request().query(`
      SELECT
        j.name AS jobName,
        j.enabled,
        CASE
          WHEN h.run_date IS NULL OR h.run_date = 0 THEN NULL
          ELSE DATEADD(SECOND, (h.run_time / 10000) * 3600 + ((h.run_time / 100) % 100) * 60 + (h.run_time % 100),
            CONVERT(datetime, CONVERT(char(8), h.run_date), 112))
        END AS lastRunAt,
        h.run_status AS lastRunStatus,
        h.message
      FROM msdb.dbo.sysjobs j
      OUTER APPLY (
        SELECT TOP (1) run_date, run_time, run_status, message
        FROM msdb.dbo.sysjobhistory
        WHERE job_id = j.job_id AND step_id = 0
        ORDER BY run_date DESC, run_time DESC
      ) h
      WHERE j.name LIKE N'DLE_%' OR j.name LIKE N'%DLE_Enterprise%'
      ORDER BY j.name;
    `);
    return (result.recordset || []) as AgentJobRow[];
  } catch {
    return [] as AgentJobRow[];
  }
};

const queryHealthLog = async (pool: sql.ConnectionPool) => {
  try {
    const result = await pool.request().query(`
      IF OBJECT_ID(N'dba.BackupHealthLog', N'U') IS NULL
        SELECT CAST(NULL AS datetime2(0)) AS checkedAt, CAST(NULL AS varchar(20)) AS status, CAST(NULL AS nvarchar(1000)) AS message,
               CAST(NULL AS datetime) AS lastFullBackupAt, CAST(NULL AS int) AS fullBackupAgeHours
        WHERE 1 = 0;
      ELSE
        SELECT TOP (1)
          checked_at AS checkedAt,
          status,
          message,
          last_full_backup_at AS lastFullBackupAt,
          full_backup_age_hours AS fullBackupAgeHours
        FROM dba.BackupHealthLog
        ORDER BY checked_at DESC;
    `);
    return (result.recordset?.[0] || null) as HealthLogRow | null;
  } catch {
    return null;
  }
};

const mergeReplicationTargets = (targets: BackupReplicationTarget[], history: BackupHistoryRow[]) => {
  const latestFull = history.find((row) => row.backupType === 'D');
  return targets.map((target) => {
    if (!target.location.trim()) return target;
    const matching = history.filter((row) => pathMatchesTarget(row.physicalDeviceName, target.location));
    const latest = matching[0] || (target.target === PRIMARY_TARGET ? latestFull : undefined);
    if (!latest?.backupFinishDate) {
      return {
        ...target,
        status: target.status === 'Verified' ? target.status : 'Configured',
        lastCopy: target.lastCopy || '',
        lag: target.lag || 'Not available',
      };
    }
    const finishedAt = new Date(latest.backupFinishDate);
    const lagMinutes = Math.max(0, Math.round((Date.now() - finishedAt.getTime()) / 60000));
    return {
      ...target,
      status: lagMinutes <= 26 * 60 ? 'Verified' : 'Warning',
      lastCopy: finishedAt.toISOString(),
      lag: formatDuration(lagMinutes),
    };
  });
};

const buildLiveMetrics = (
  history: BackupHistoryRow[],
  health: HealthLogRow | null,
  runningJobs: BackupExecutionJob[],
): BackupMetric[] => {
  const latestFull = history.find((row) => row.backupType === 'D');
  const latestLog = history.find((row) => row.backupType === 'L');
  const running = runningJobs.some((job) => job.status === 'Running');
  if (running) {
    return metricSnapshot('Running', 'Backup operation currently in progress.');
  }
  if (!latestFull?.backupFinishDate) {
    return [
      { label: 'Backup Service', value: 'No backup', detail: 'No full backup history found in SQL Server.', tone: 'amber' },
      { label: 'Health Check', value: health?.status || 'Unknown', detail: health?.message || 'Run a full backup or configure SQL Agent jobs.', tone: health?.status === 'CRITICAL' ? 'red' : 'amber' },
      { label: 'Storage Usage', value: 'Unknown', detail: 'Backup size will appear after the first successful backup.', tone: 'slate' },
      { label: 'Last Verified Backup', value: 'Pending', detail: 'No verified backup recorded yet.', tone: 'amber' },
    ];
  }
  const finishedAt = new Date(latestFull.backupFinishDate);
  const ageHours = Math.max(0, Math.round((Date.now() - finishedAt.getTime()) / 3600000));
  const healthTone: BackupMetric['tone'] = health?.status === 'CRITICAL' ? 'red' : health?.status === 'OK' ? 'green' : ageHours > 26 ? 'amber' : 'green';
  return [
    {
      label: 'Backup Service',
      value: ageHours <= 26 ? 'Healthy' : 'Attention',
      detail: `Last full backup ${finishedAt.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })} (${ageHours}h ago).`,
      tone: ageHours <= 26 ? 'green' : 'amber',
    },
    {
      label: 'Health Check',
      value: health?.status || (ageHours <= 26 ? 'OK' : 'WARNING'),
      detail: health?.message || (ageHours <= 26 ? 'Backup recency is within daily policy.' : 'Daily full backup is older than 26 hours.'),
      tone: healthTone,
    },
    {
      label: 'Storage Usage',
      value: formatBytes(Number(latestFull.backupSize || 0)),
      detail: latestLog?.backupFinishDate
        ? `Latest log backup ${new Date(latestLog.backupFinishDate).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}.`
        : 'No transaction log backup recorded yet.',
      tone: 'blue',
    },
    {
      label: 'Last Verified Backup',
      value: 'Available',
      detail: `${latestFull.physicalDeviceName} · ${formatBytes(Number(latestFull.backupSize || 0))}`,
      tone: 'green',
    },
  ];
};

const agentJobsToQueue = (jobs: AgentJobRow[]): BackupExecutionJob[] =>
  jobs.map((job) => ({
    job: job.jobName,
    owner: 'SQL Server Agent',
    nextRun: job.lastRunAt ? new Date(job.lastRunAt).toISOString() : '',
    retry: job.message || 'Managed by SQL Server Agent',
    status: job.enabled ? (job.lastRunStatus === 0 ? 'Completed' : job.lastRunStatus === 1 ? 'Failed' : 'Scheduled') : 'Disabled',
  }));

export const enrichBackupDisasterRecoveryState = async (baseState: BackupDisasterRecoveryState) => {
  const pool = await getDleEnterpriseDbPool();
  if (!pool) {
    return {
      ...baseState,
      serviceMetrics: metricSnapshot('Failed', 'DLE_Enterprise database is not connected.'),
    };
  }

  const [history, agentJobs, health] = await Promise.all([
    queryBackupHistory(pool),
    queryAgentJobs(pool),
    queryHealthLog(pool),
  ]);

  const manualQueue = baseState.executionQueue.filter((job) => job.status === 'Running' || job.job.startsWith('DLE_Enterprise Full Database Backup'));
  const policyQueue = queueFromPolicies(baseState.backupPolicies);
  const agentQueue = agentJobsToQueue(agentJobs);
  const executionQueue = compact(
    [...manualQueue, ...policyQueue, ...agentQueue].filter((job, index, items) => items.findIndex((item) => item.job === job.job) === index),
    20,
  );

  const serviceMetrics = buildLiveMetrics(history, health, manualQueue);
  const replicationTargets = mergeReplicationTargets(baseState.replicationTargets, history);
  const failureRecoveryRules = failureRecoveryFromPolicies(baseState.backupPolicies);
  const storageAutomation = storageAutomationFromPolicies(baseState.backupPolicies);

  const restoreReadiness = [...baseState.restoreReadiness];
  const latestFull = history.find((row) => row.backupType === 'D');
  if (latestFull?.physicalDeviceName && !restoreReadiness.some((item) => item.evidence.includes(latestFull.physicalDeviceName))) {
    restoreReadiness.unshift(restoreRecord(
      latestFull.physicalDeviceName,
      latestFull.backupFinishDate ? new Date(latestFull.backupFinishDate).toISOString() : new Date().toISOString(),
      'Passed',
      `Latest full backup available at ${latestFull.physicalDeviceName}.`,
    ));
  }

  const incidents = [...baseState.incidents];
  if (health?.status === 'CRITICAL') {
    const message = health.message;
    if (!incidents.some((incident) => incident.message === message)) {
      incidents.unshift(incidentRecord(message, new Date().toISOString(), 'Critical'));
    }
  }

  return {
    ...baseState,
    serviceMetrics,
    replicationTargets,
    executionQueue,
    failureRecoveryRules,
    storageAutomation,
    restoreReadiness: compact(restoreReadiness, 20),
    incidents: compact(incidents, 50),
  };
};

export const readEnrichedBackupDisasterRecoveryState = async () =>
  enrichBackupDisasterRecoveryState(await readBackupDisasterRecoveryState());

const latestFullBackupFile = async (pool: sql.ConnectionPool) => {
  const history = await queryBackupHistory(pool);
  const latest = history.find((row) => row.backupType === 'D');
  return latest?.physicalDeviceName || '';
};

export const runDleEnterpriseRestoreDrill = async (actor: string) => {
  const pool = await getDleEnterpriseDbPool();
  if (!pool) throw new Error('DLE_Enterprise database is not available.');

  const initialState = await readBackupDisasterRecoveryState();
  const backupFile = await latestFullBackupFile(pool);
  if (!backupFile) throw new Error('No full backup file found. Run a full backup before starting a restore drill.');

  const startedAt = new Date().toISOString();
  await writeBackupDisasterRecoveryState({
    ...initialState,
    serviceMetrics: metricSnapshot('Running', `Running RESTORE VERIFYONLY on ${backupFile}`),
    executionQueue: compact([jobRecord('Restore readiness drill', 'Running', backupFile, startedAt, 'Restore verification worker'), ...initialState.executionQueue], 20),
  }, actor);

  try {
    const request = pool.request();
    (request as typeof request & { timeout: number }).timeout = Number(process.env.DLE_ENTERPRISE_BACKUP_TIMEOUT_MS || 900000);
    await request
      .input('BackupPath', sql.NVarChar(4000), backupFile)
      .query(`RESTORE VERIFYONLY FROM DISK = @BackupPath WITH CHECKSUM;`);

    const completedAt = new Date().toISOString();
    const latest = await readBackupDisasterRecoveryState();
    const next = await writeBackupDisasterRecoveryState({
      ...latest,
      serviceMetrics: metricSnapshot('Completed', 'Restore drill completed successfully.', completedAt),
      executionQueue: compact([jobRecord('Restore readiness drill', 'Completed', backupFile, completedAt, 'Restore verification worker'), ...latest.executionQueue.filter((job) => job.status !== 'Running')], 20),
      restoreReadiness: compact([restoreRecord(backupFile, completedAt, 'Passed'), ...latest.restoreReadiness], 20),
      audit: compact([{ at: completedAt, actor, action: 'Restore drill completed', detail: backupFile }, ...latest.audit], 100),
    }, actor);
    return enrichBackupDisasterRecoveryState(next);
  } catch (error) {
    const failedAt = new Date().toISOString();
    const message = error instanceof Error ? error.message : 'Restore drill failed.';
    const latest = await readBackupDisasterRecoveryState();
    const next = await writeBackupDisasterRecoveryState({
      ...latest,
      serviceMetrics: metricSnapshot('Failed', message),
      executionQueue: compact([jobRecord('Restore readiness drill', 'Failed', backupFile, failedAt, 'Restore verification worker'), ...latest.executionQueue.filter((job) => job.status !== 'Running')], 20),
      restoreReadiness: compact([restoreRecord(backupFile, failedAt, 'Failed', message), ...latest.restoreReadiness], 20),
      incidents: compact([incidentRecord(message, failedAt, 'Critical'), ...latest.incidents], 50),
      audit: compact([{ at: failedAt, actor, action: 'Restore drill failed', detail: message }, ...latest.audit], 100),
    }, actor);
    return enrichBackupDisasterRecoveryState(next);
  }
};

export const runDleEnterpriseFullBackup = async (actor: string) => {
  const pool = await getDleEnterpriseDbPool();
  if (!pool) throw new Error('DLE_Enterprise database is not available.');

  const initialState = await readBackupDisasterRecoveryState();
  const target = targetWithPrimary(initialState);
  if (!target?.location.trim()) throw new Error('Configure at least one backup location before running a backup.');

  const databaseResult = await pool.request().query('SELECT DB_NAME() AS databaseName');
  const databaseName = String(databaseResult.recordset[0]?.databaseName || DATABASE_NAME);
  const filePath = backupFilePath(target.location, databaseName);
  ensureBackupDirectory(filePath);
  const startedAt = new Date().toISOString();

  await writeBackupDisasterRecoveryState({
    ...initialState,
    serviceMetrics: metricSnapshot('Running', `Writing backup to ${backupDirectory(filePath)}`),
    executionQueue: compact([jobRecord('DLE_Enterprise Full Database Backup', 'Running', filePath, startedAt), ...initialState.executionQueue], 20),
  }, actor);

  const startedMs = Date.now();
  try {
    const request = pool.request();
    (request as typeof request & { timeout: number }).timeout = Number(process.env.DLE_ENTERPRISE_BACKUP_TIMEOUT_MS || 900000);
    await request
      .input('BackupPath', sql.NVarChar(4000), filePath)
      .query(`
DECLARE @DatabaseName sysname = DB_NAME();
DECLARE @BackupSql nvarchar(max) = N'BACKUP DATABASE ' + QUOTENAME(@DatabaseName) + N' TO DISK = @BackupPath WITH INIT, CHECKSUM, COMPRESSION, STATS = 10;';
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
    const next = await writeBackupDisasterRecoveryState({
      ...latest,
      serviceMetrics: metricSnapshot('Completed', `Full backup completed in ${elapsedSeconds}s`, completedAt),
      replicationTargets: nextTargets,
      executionQueue: compact([jobRecord('DLE_Enterprise Full Database Backup', 'Completed', filePath, completedAt), ...latest.executionQueue.filter((job) => job.status !== 'Running')], 20),
      restoreReadiness: compact([restoreRecord(filePath, completedAt, 'Passed'), ...latest.restoreReadiness], 20),
      audit: compact([{ at: completedAt, actor, action: 'Full database backup completed', detail: filePath }, ...latest.audit], 100),
    }, actor);
    return enrichBackupDisasterRecoveryState(next);
  } catch (error) {
    const failedAt = new Date().toISOString();
    const message = error instanceof Error ? error.message : 'Full database backup failed.';
    const latest = await readBackupDisasterRecoveryState();
    const next = await writeBackupDisasterRecoveryState({
      ...latest,
      serviceMetrics: metricSnapshot('Failed', message),
      executionQueue: compact([jobRecord('DLE_Enterprise Full Database Backup', 'Failed', filePath, failedAt), ...latest.executionQueue.filter((job) => job.status !== 'Running')], 20),
      incidents: compact([incidentRecord(message, failedAt), ...latest.incidents], 50),
      audit: compact([{ at: failedAt, actor, action: 'Full database backup failed', detail: message }, ...latest.audit], 100),
    }, actor);
    return enrichBackupDisasterRecoveryState(next);
  }
};

export const saveBackupDisasterRecoveryConfiguration = async (
  patch: Partial<BackupDisasterRecoveryState>,
  actor: string,
) => {
  const current = await readBackupDisasterRecoveryState();
  const backupPolicies = patch.backupPolicies ? validateBackupPolicies(patch.backupPolicies) : current.backupPolicies;
  const saved = await writeBackupDisasterRecoveryState({
    ...current,
    ...patch,
    backupPolicies,
    failureRecoveryRules: failureRecoveryFromPolicies(backupPolicies),
    storageAutomation: storageAutomationFromPolicies(backupPolicies),
    executionQueue: queueFromPolicies(backupPolicies),
  }, actor);
  return enrichBackupDisasterRecoveryState(saved);
};
