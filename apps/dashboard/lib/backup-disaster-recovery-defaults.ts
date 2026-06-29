import type { BackupDisasterRecoveryState } from '@/lib/backup-disaster-recovery-types';

export const defaultBackupDisasterRecoveryState = (): BackupDisasterRecoveryState => ({
  schemaVersion: 1,
  serviceMetrics: [],
  backupPolicies: [],
  replicationTargets: [
    { target: 'Primary Backup', location: '', status: 'Not configured', lastCopy: '', lag: '' },
    { target: 'Secondary Backup', location: '', status: 'Not configured', lastCopy: '', lag: '' },
    { target: 'Disaster Recovery Backup', location: '', status: 'Not configured', lastCopy: '', lag: '' },
    { target: 'Cloud Backup', location: '', status: 'Not configured', lastCopy: '', lag: '' },
  ],
  executionQueue: [],
  failureRecoveryRules: [],
  storageAutomation: [],
  incidents: [],
  restoreReadiness: [],
  audit: [],
  updatedAt: new Date().toISOString(),
  updatedBy: 'System',
});
