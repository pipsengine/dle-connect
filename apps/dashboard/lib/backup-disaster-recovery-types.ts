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
  updatedAt: string;
  updatedBy: string;
};
