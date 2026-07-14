export type BackupMetric = {
  label: string;
  value: string;
  detail: string;
  tone: 'green' | 'blue' | 'amber' | 'red' | 'slate' | 'violet';
};

export type BackupPolicy = {
  type: string;
  schedule: string;
  validation: string;
  retention: string;
  status: string;
  /** ISO timestamp of last successful or attempted automated run. */
  lastRunAt?: string;
  lastRunStatus?: 'success' | 'failed' | 'skipped';
  lastRunDetail?: string;
};

export type BackupReplicationTarget = {
  target: string;
  location: string;
  status: string;
  lastCopy: string;
  lag: string;
};

export type BackupExecutionJob = {
  job: string;
  owner: string;
  nextRun: string;
  retry: string;
  status: string;
};

export type BackupFailureRecoveryRule = {
  trigger: string;
  action: string;
  retry: string;
  status: string;
};

export type BackupStorageAutomation = {
  scope: string;
  rule: string;
  threshold: string;
  status: string;
};

export type BackupIncident = {
  severity: string;
  message: string;
  owner: string;
  status: string;
};

export type BackupRestoreReadiness = {
  control: string;
  result: string;
  evidence: string;
};

export type BackupAuditEvent = {
  at: string;
  actor: string;
  action: string;
  detail: string;
};

export type BackupLastOperation = {
  type: 'full-backup' | 'log-backup' | 'differential-backup' | 'application-backup' | 'restore-drill' | 'configuration' | 'payroll-cutover' | 'scheduled-backup';
  status: 'success' | 'failed' | 'running';
  message: string;
  at: string;
  payrollPeriod?: string;
};

export type PayrollCutoverBackupRecord = {
  payrollPeriod: string;
  backupFilePath: string;
  completedAt: string;
  status: 'success' | 'failed';
  actor: string;
  message: string;
};

export type PayrollCutoverBackupSettings = {
  /** Automatic full backup when a payroll period is closed and locked. */
  enabled: boolean;
  /** Block opening the next payroll period until the prior closed period has a verified cutover backup. */
  requireBeforeNextPeriodOpen: boolean;
  records: PayrollCutoverBackupRecord[];
};

export type BackupDisasterRecoveryState = {
  schemaVersion: 1;
  serviceMetrics: BackupMetric[];
  backupPolicies: BackupPolicy[];
  replicationTargets: BackupReplicationTarget[];
  executionQueue: BackupExecutionJob[];
  failureRecoveryRules: BackupFailureRecoveryRule[];
  storageAutomation: BackupStorageAutomation[];
  incidents: BackupIncident[];
  restoreReadiness: BackupRestoreReadiness[];
  audit: BackupAuditEvent[];
  lastOperation?: BackupLastOperation | null;
  payrollCutover?: PayrollCutoverBackupSettings;
  updatedAt: string;
  updatedBy: string;
};
