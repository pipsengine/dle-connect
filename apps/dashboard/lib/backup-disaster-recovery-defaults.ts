import type { BackupDisasterRecoveryState, BackupPolicy } from '@/lib/backup-disaster-recovery-types';

export const defaultAutomatedBackupPolicies = (): BackupPolicy[] => [
  {
    type: 'Full database backup',
    schedule: 'Daily 23:00',
    validation: 'RESTORE VERIFYONLY',
    retention: '35 days',
    status: 'Automated',
  },
  {
    type: 'Transaction log backup',
    schedule: 'Real-time (every 5 minutes)',
    validation: 'Log chain validation',
    retention: '8 days',
    status: 'Automated',
  },
  {
    type: 'Application backup',
    schedule: 'Every 15 minutes',
    validation: 'Manifest reconciliation',
    retention: '14 days',
    status: 'Automated',
  },
  {
    type: 'Configuration backup',
    schedule: 'Every 6 hours',
    validation: 'Archive integrity check',
    retention: '35 days',
    status: 'Automated',
  },
];

export const defaultBackupDisasterRecoveryState = (): BackupDisasterRecoveryState => ({
  schemaVersion: 1,
  serviceMetrics: [],
  backupPolicies: defaultAutomatedBackupPolicies(),
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
  lastOperation: null,
  payrollCutover: {
    enabled: true,
    requireBeforeNextPeriodOpen: true,
    records: [],
  },
  updatedAt: new Date().toISOString(),
  updatedBy: 'System',
});
